const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Serve the UI folder statically
app.use('/ui', express.static(path.join(__dirname, '../ui')));

const DB_FILE = path.join(__dirname, 'cars_db.json');

// --- DICIONARIES (Regex & Keywords) ---

const pros = [
    /new timing belt/i,
    /new water pump/i,
    /regular oil changes/i,
    /1 owner|one owner/i,
    /clean title/i,
    /new tires/i,
    /new brakes/i,
    /well maintained/i,
    /garage kept/i,
    /dealer serviced/i,
    /service records/i,
    /recently serviced/i,
    /new battery/i,
    /no accidents/i
];

const cons = [
    /needs a jump/i,
    /needs battery/i,
    /ac blows warm|no ac/i,
    /needs freon/i,
    /minor rust/i,
    /check engine light/i,
    /cel/i, // check engine light acronym
    /needs tires/i,
    /needs brakes/i,
    /leaks a little|minor leak/i,
    /salvage title|rebuilt title/i, // Wait, these are red flags, moving to red flags below
    /needs alignment/i,
    /dents|scratches/i,
    /peeling clear coat/i,
    /rip in seat|torn seat/i
];

const consFiltered = [
    /needs a jump/i,
    /needs battery/i,
    /ac blows warm|no ac/i,
    /needs freon/i,
    /minor rust|surface rust/i,
    /check engine light|cel (on|illuminated)/i,
    /needs tires/i,
    /needs brakes/i,
    /leaks oil/i,
    /needs alignment/i,
    /dents|scratches/i,
    /peeling clear coat|paint fade/i,
    /rip in seat|torn seat/i,
    /exhaust leak/i,
    /needs tlc/i
];

const redFlags = [
    /salvage title|rebuilt title/i,
    /blown head gasket/i,
    /transmission slips|needs transmission|bad transmission|slipping/i,
    /frame damage/i,
    /for parts only|parts car/i,
    /not running|doesn't run|won't start/i,
    /bring a trailer|bring your own trailer|needs to be towed/i,
    /engine knock|rod knock/i,
    /mechanic special/i,
    /overheats/i,
    /missing title|no title|bill of sale only/i
];

// --- SCORING LOGIC ---

function scanText(text) {
    const result = {
        pros: [],
        cons: [],
        redFlags: [],
        score: 100 // Start with perfect score, deduct/add points
    };

    if (!text) return result;

    // Check Pros (+5 points each, cap score at 100)
    pros.forEach(regex => {
        const match = text.match(regex);
        if (match) {
            result.pros.push(match[0]);
            result.score = Math.min(100, result.score + 5);
        }
    });

    // Check Cons (-10 points each)
    consFiltered.forEach(regex => {
        const match = text.match(regex);
        if (match) {
            result.cons.push(match[0]);
            result.score -= 10;
        }
    });

    // Check Red Flags (Auto-fail or heavy deduction)
    redFlags.forEach(regex => {
        const match = text.match(regex);
        if (match) {
            result.redFlags.push(match[0]);
        }
    });
        if (result.redFlags.length > 0) {
        // If there are red flags, base score plunges to 10 max
        result.score = Math.min(result.score, 10) - (result.redFlags.length * 10);
        if (result.score < 0) result.score = 0;
    } else {
        // Ensure score doesn't drop below 20 unless there's a red flag
        if (result.score < 20 && result.cons.length > 0) {
            result.score = 20;
        }
    }

    // Deduplication for display
    result.pros = [...new Set(result.pros)];
    result.cons = [...new Set(result.cons)];
    result.redFlags = [...new Set(result.redFlags)];

    return result;
}

// --- DATABASE HELPERS ---
function loadCars() {
    if (fs.existsSync(DB_FILE)) {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
    return [];
}

function saveCars(cars) {
    fs.writeFileSync(DB_FILE, JSON.stringify(cars, null, 2));
}

// --- ENDPOINTS ---

// GET /api/cars - Retrieve all saved cars
app.get('/api/cars', (req, res) => {
    res.json(loadCars());
});

// POST /api/scan - Scan new car data
app.post('/api/scan', (req, res) => {
    const carData = req.body;
    /* 
      Expected carData: { 
        id: string, 
        url: string, 
        title: string, 
        price: string, 
        mileage: string, 
        description: string 
      }
    */

    if (!carData.description) {
        return res.status(400).json({ error: 'Description is required' });
    }

    const analysis = scanText(carData.description);

    const processedCar = {
        ...carData,
        analysis,
        scannedAt: new Date().toISOString()
    };

    let cars = loadCars();
    // Update if exists, otherwise append
    const existingIndex = cars.findIndex(c => c.id === processedCar.id);
    if (existingIndex >= 0) {
        cars[existingIndex] = processedCar;
    } else {
        cars.push(processedCar);
    }

    saveCars(cars);

    res.json(processedCar);
});

// DELETE /api/cars/:id - Rule out a car
app.delete('/api/cars/:id', (req, res) => {
    let cars = loadCars();
    cars = cars.filter(c => c.id !== req.params.id);
    saveCars(cars);
    res.json({ success: true });
});

// POST /api/scan-url - Batch Scan from URL
app.post('/api/scan-url', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    let browser;
    try {
        console.log(`Batch scanning ${url}...`);
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        try {
            // AutoTrader's SPA often times out on domcontentloaded when headless, so we wait for commit and rely on fixed timeouts.
            await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
        } catch (e) {
            console.log("Navigation timeout caught, attempting to extract DOM anyway...");
        }

        await page.waitForSelector('#__NEXT_DATA__', { timeout: 10000 }).catch(() => { });
        const cookieSelectors = [
            'button[data-testid="close-button"]',
            'button[data-testid="cookie-accept-button"]',
            'text=Accept',
            'text=ACCEPT'
        ];
        for (const selector of cookieSelectors) {
            try {
                const locator = page.locator(selector).first();
                if (await locator.count()) {
                    await locator.click({ timeout: 1000 });
                    await page.waitForTimeout(500);
                    break;
                }
            } catch (err) {
                // ignore inability to click cookie banners
            }
        }

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        }).catch(() => { });
        await page.waitForTimeout(4000); // Wait for SPA to hydrate

        // Extract data
        const carData = await page.evaluate(() => {
            const cleanup = (text) => {
                if (!text || typeof text !== 'string') return '';
                return text.replace(/\s+/g, ' ').trim();
            };

            const decodeHtml = (html) => {
                if (!html) return '';
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                return cleanup(tmp.innerText);
            };

            const getNextListing = () => {
                const script = document.getElementById('__NEXT_DATA__');
                if (!script) return null;
                try {
                    const data = JSON.parse(script.textContent);
                    return data?.props?.pageProps?.listingDetails || data?.props?.pageProps?.listing || null;
                } catch (err) {
                    return null;
                }
            };

            const pickText = (selectors, minLength = 25) => {
                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const text = cleanup(el.innerText);
                        if (text.length >= minLength) {
                            return text;
                        }
                    }
                }
                return '';
            };

            const listingDetails = getNextListing();

            const url = window.location.href;
            let description = '';

            if (listingDetails?.description) {
                description = decodeHtml(listingDetails.description);
            }

            if (!description && url.includes('autotrader')) {
                description = pickText([
                    '[data-cy="vehicle-description"]',
                    '[data-testid="vehicle-description"]',
                    '[data-test="vehicleDescription"]',
                    '[data-test="description"]',
                    '[data-testid="long-text"]',
                    '[data-cy="description-section"]',
                    '.VehicleDescription_container__rajO2'
                ], 60);

                if (!description) {
                    const paragraphs = Array.from(document.querySelectorAll('section[data-cy="vehicle-description"] p, section[data-cy="description-section"] p'));
                    const combined = cleanup(paragraphs.map(p => p.innerText).join(' '));
                    if (combined.length > 60) description = combined;
                }
            }

            if (!description) {
                const mainEl = document.querySelector('main');
                if (mainEl) {
                    const mainText = cleanup(mainEl.innerText);
                    if (mainText.length > 60 && mainText.length < 4000) description = mainText;
                }
            }

            if (!description) {
                const bodyText = cleanup(document.body.innerText);
                description = bodyText.length > 4000 ? bodyText.slice(0, 4000) : bodyText;
            }

            const buildTitleFromListing = () => {
                if (!listingDetails?.vehicle) return '';
                const parts = [
                    listingDetails.vehicle.modelYear,
                    listingDetails.vehicle.make,
                    listingDetails.vehicle.model,
                    listingDetails.vehicle.modelVersionInput
                ].filter(Boolean);
                return cleanup(parts.join(' '));
            };

            let title = cleanup(listingDetails?.title) || buildTitleFromListing();
            if (!title) {
                const heading = document.querySelector('h1, h2');
                title = cleanup(heading?.innerText) || cleanup(document.title) || 'Unknown Car';
            }

            const formatPrice = (price) => {
                if (!price) return '';
                return cleanup(price);
            };

            let price = formatPrice(listingDetails?.prices?.public?.price || listingDetails?.prices?.dealer?.price);
            if (!price) {
                const priceEl = document.querySelector('[data-testid="vehicle-price"]') || Array.from(document.querySelectorAll('span, div')).find(el => {
                    const text = cleanup(el.innerText);
                    return /^\$[\s\d,]+$/.test(text);
                });
        if (priceEl) price = cleanup(priceEl.innerText);
            }
            if (!price) price = 'Unknown price';

            const formatMileage = () => {
                if (typeof listingDetails?.vehicle?.mileageInKm === 'string') {
                    return cleanup(listingDetails.vehicle.mileageInKm);
                }
                if (typeof listingDetails?.vehicle?.mileageInKmRaw === 'number') {
                    return listingDetails.vehicle.mileageInKmRaw.toLocaleString() + ' km';
                }
                const targeted = document.querySelector('[data-testid="vehicleMileage"]');
                if (targeted) {
                    const txt = cleanup(targeted.innerText);
                    if (txt) return txt;
                }
                const miEl = Array.from(document.querySelectorAll('span, div')).find(el => {
                    const text = cleanup(el.innerText).toLowerCase();
                    return text.includes('km') || text.includes('mile');
                });
                return cleanup(miEl?.innerText || '');
            };

            let mileage = formatMileage();
            if (!mileage) mileage = 'Unknown mileage';

            return { title, price, mileage, description, url };
        });
        if (!carData.description || carData.description.length < 20) {
            return res.status(400).json({ success: false, error: 'Failed to extract useful description' });
        }

        const id = crypto.createHash('md5').update(url).digest('hex').substring(0, 15);
        const analysis = scanText(carData.description);
        const processedCar = {
            id,
            url,
            title: carData.title,
            price: carData.price,
            mileage: carData.mileage,
            description: carData.description,
            analysis,
            scannedAt: new Date().toISOString()
        };

        let cars = loadCars();
        // Overwrite or append based on ID
        const existingIndex = cars.findIndex(c => c.id === id);
        if (existingIndex >= 0) {
            cars[existingIndex] = processedCar;
        } else {
            cars.push(processedCar);
        }
        saveCars(cars);

        res.json({ success: true, car: processedCar });

    } catch (error) {
        console.error("Playwright scan-url error:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

// POST /api/rescan - Rescan a car using Playwright
app.post('/api/rescan', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Car ID is required' });

    let cars = loadCars();
    const carIndex = cars.findIndex(c => c.id === id);
    if (carIndex === -1) return res.status(404).json({ error: 'Car not found in DB' });

    const car = cars[carIndex];

    if (!car.url) {
        return res.status(400).json({ error: 'No URL associated with this car' });
    }

    let browser;
    try {
        console.log(`Rescanning ${car.url}...`);
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(car.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Very rudimentary wait for description
        await page.waitForTimeout(3000);

        // Playwright extraction logic (heuristic)
        const pageData = await page.evaluate(() => {
            let description = "";
            const url = window.location.href;

            if (url.includes('facebook.com')) {
                const descEl = document.querySelector('div[dir="auto"] > span');
                if (descEl) description = descEl.innerText;
            } else if (url.includes('craigslist.org')) {
                const dEl = document.querySelector('#postingbody');
                if (dEl) description = dEl.innerText;
            } else {
                // grab body text as fallback
                description = document.body.innerText;
            }

            return { description };
        });
        if (pageData.description && pageData.description.length > 20) {
            car.description = pageData.description;
            car.analysis = scanText(car.description);
            car.scannedAt = new Date().toISOString();

            cars[carIndex] = car;
            saveCars(cars);

            res.json({ success: true, car });
        } else {
            res.status(400).json({ success: false, error: 'Could not extract description on rescan' });
        }

    } catch (error) {
        console.error("Playwright rescan error:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`Used Car Scanner server running on http://localhost:${PORT}`);
});
