// app.js - UI Logic for Dashboard
const API_BASE = 'http://localhost:3001/api';

const carsGrid = document.getElementById('cars-grid');
const statTotal = document.getElementById('stat-total');
const statAvoid = document.getElementById('stat-avoid');
const presetBtns = document.querySelectorAll('.preset-btn');
const themeToggle = document.getElementById('theme-toggle');

let allCars = [];
let currentFilter = 'all';

let lastCarsString = "";

// --- INITIALIZATION ---
async function init() {
    setupTheme();
    setupEventListeners();
    await loadCars();
    lastCarsString = JSON.stringify(allCars);
    render();
    
    // Auto-refresh the dashboard every 3 seconds gently
    setInterval(async () => {
        await loadCars();
        const currentString = JSON.stringify(allCars);
        if (currentString !== lastCarsString) {
            lastCarsString = currentString;
            render();
        }
    }, 3000);
}

// --- DATA FETCHING ---
async function loadCars() {
    try {
        const res = await fetch(`${API_BASE}/cars`);
        allCars = await res.json();
        // Sort newest first
        allCars.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
    } catch (error) {
        console.error("Failed to load cars", error);
        carsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 2rem;">
        <h3 class="text-danger">Failed to connect to server.</h3>
        <p>Make sure the Node server is running on port 3001.</p>
      </div>
    `;
    }
}

// --- RENDER LOGIC ---
function render() {
    if (!allCars || allCars.length === 0) {
        carsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
        <h3>No cars scanned yet.</h3>
        <p>Use the extension on supported sites to start scanning.</p>
      </div>`;
        updateStats(0, 0);
        return;
    }

    let filtered = allCars;

    if (currentFilter === 'highly-rated') {
        filtered = allCars.filter(c => c.analysis && c.analysis.score > 80);
    } else if (currentFilter === 'no-red-flags') {
        filtered = allCars.filter(c => !c.analysis || c.analysis.redFlags.length === 0);
    } else if (currentFilter === 'maintenance-kings') {
        filtered = allCars.filter(c => c.analysis && c.analysis.pros.length >= 3);
    }

    const avoidCount = allCars.filter(c => c.analysis && c.analysis.redFlags.length > 0).length;
    updateStats(allCars.length, avoidCount);

    carsGrid.innerHTML = filtered.map(car => createCarCard(car)).join('');
}

function updateStats(total, avoid) {
    statTotal.innerText = total;
    statAvoid.innerText = avoid;
}

function createCarCard(car) {
    if (!car) return '';
    const analysis = car.analysis || { score: 0, pros: [], cons: [], redFlags: [] };

    let scoreClass = 'score-low';
    if (analysis.score > 75) scoreClass = 'score-high';
    else if (analysis.score > 40) scoreClass = 'score-med';

    const formatBadges = (arr, type) => {
        if (!arr || arr.length === 0) return `<span class="badge" style="background:var(--bg-color); color:var(--text-secondary)">None</span>`;
        return arr.map(item => `<span class="badge badge-${type}">${item}</span>`).join('');
    };

    return `
    <div class="car-card" data-id="${car.id}">
      <div class="car-header">
        <h3 class="car-title">${car.title}</h3>
        <div class="car-price">${car.price}</div>
        <div class="car-meta">
          <span>${car.mileage}</span>
          <span>•</span>
          <a href="${car.url}" target="_blank" style="color: var(--primary); text-decoration: none;">View Listing</a>
        </div>
        <div class="car-score-badge ${scoreClass}">${analysis.score}</div>
      </div>
      
      <div class="car-body">
        ${analysis.redFlags.length > 0 ? `
          <div class="analysis-section">
            <div class="analysis-title text-danger">🚩 Red Flags</div>
            <div class="badges-container">
              ${formatBadges(analysis.redFlags, 'redflag')}
            </div>
          </div>
        ` : ''}

        <div class="analysis-section">
          <div class="analysis-title">👍 Pros</div>
          <div class="badges-container">
            ${formatBadges(analysis.pros, 'pro')}
          </div>
        </div>

        <div class="analysis-section">
          <div class="analysis-title">👎 Cons</div>
          <div class="badges-container">
            ${formatBadges(analysis.cons, 'con')}
          </div>
        </div>
      </div>
      
      <div class="car-actions">
        <button class="btn btn-primary btn-rescan" data-id="${car.id}">Rescan (Playwright)</button>
        <button class="btn btn-danger btn-delete" data-id="${car.id}">Delete</button>
      </div>
    </div>
  `;
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            presetBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.getAttribute('data-filter');
            render();
        });
    });

    carsGrid.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-delete')) {
            const id = e.target.getAttribute('data-id');
            await deleteCar(id);
        } else if (e.target.classList.contains('btn-rescan')) {
            const id = e.target.getAttribute('data-id');
            const btn = e.target;
            btn.innerText = 'Scanning...';
            btn.disabled = true;
            await rescanCar(id);
            btn.innerText = 'Rescan (Playwright)';
            btn.disabled = false;
        }
    });

    themeToggle.addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            themeToggle.innerText = '🌓';
        } else {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeToggle.innerText = '☀️';
        }
    });
}

// --- ACTIONS ---
async function deleteCar(id) {
    try {
        const res = await fetch(`${API_BASE}/cars/${id}`, { method: 'DELETE' });
        if (res.ok) {
            allCars = allCars.filter(c => c.id !== id);
            render();
        }
    } catch (err) {
        console.error('Delete failed', err);
        alert('Failed to delete car');
    }
}

async function rescanCar(id) {
    try {
        const res = await fetch(`${API_BASE}/rescan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            const idx = allCars.findIndex(c => c.id === id);
            if (idx !== -1) allCars[idx] = data.car;
            render();
        } else {
            alert(`Rescan failed: ${data.error}`);
        }
    } catch (err) {
        console.error('Rescan failed', err);
        alert('Rescan failed. Make sure server is running.');
    }
}

// --- THEME ---
function setupTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.innerText = '☀️';
    }
}

// Boot up
init();
