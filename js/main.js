// static/js/main.js

// Ensure THREE is loaded
if (typeof THREE === 'undefined') {
    console.error("THREE.js has not been loaded. Check script tags.");
}
if (typeof THREE.CSS2DRenderer === 'undefined' || typeof THREE.CSS2DObject === 'undefined') {
    console.error("CSS2DRenderer.js has not been loaded or is missing CSS2DObject. Check script tags and compatibility.");
}
if (typeof THREE.OrbitControls === 'undefined') {
    console.error("OrbitControls.js has not been loaded. Check script tags.");
}
if (typeof LightweightCharts === 'undefined') {
    console.error("LightweightCharts has not been loaded. Check script tags.");
}

let camera, scene, renderer, labelRenderer, controls;
let chart, candleSeries;
let stockData = [];
let currentIndex = 0;
let replayInterval;
let isPlaying = false;
let replaySpeed = 800; // milliseconds per candle (default speed adjusted)

const clock = new THREE.Clock(); // From the original 1_chart.html

const infoBar = {
    dateTime: document.getElementById('currentDateTime'),
    open: document.getElementById('currentOpen'),
    high: document.getElementById('currentHigh'),
    low: document.getElementById('currentLow'),
    close: document.getElementById('currentClose'),
};
const playPauseButton = document.getElementById('playPauseButton');
const speedControl = document.getElementById('speedControl');
const chartElement = document.getElementById('chartContainer');


function initThreeJS() {
    // Camera setup (from 1_chart.html, adjusted)
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000); // Adjusted FOV and far plane
    camera.position.set(0, 1, 3); // Adjusted camera position to look at the chart object more directly
    camera.lookAt(0,0,0);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010); // Darker background for the 3D scene

    // Lights (from 1_chart.html, simplified)
    const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5); // Softer ambient light
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0); // Adjusted intensity
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // Renderer (from 1_chart.html)
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Label Renderer for CSS2DObjects (from 1_chart.html)
    labelRenderer = new THREE.CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through to canvas for OrbitControls
    document.body.appendChild(labelRenderer.domElement);
    
    // Add OrbitControls (from 1_chart.html, ensure it uses the main renderer's domElement for events)
    controls = new THREE.OrbitControls(camera, renderer.domElement); // Use main renderer for orbit controls
    controls.minDistance = 1;
    controls.maxDistance = 50;
    controls.enablePan = true; // Allow panning
    controls.target.set(0,0,0); // Orbit around the center where the chart will be

    // Chart Element as CSS2DObject
    const chart3DObject = new THREE.CSS2DObject(chartElement);
    chart3DObject.position.set(0, 0, 0); // Position it at the center of the scene
    scene.add(chart3DObject);
    // chartElement.style.pointerEvents = 'auto'; // Enable interaction with the chart itself (if needed)

    // Axes Helper (optional, for orientation)
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);
}

function initChart() {
    if (!chartElement) {
        console.error("Chart container not found!");
        return;
    }
    chart = LightweightCharts.createChart(chartElement, {
        width: chartElement.clientWidth, // Use clientWidth for initial size
        height: chartElement.clientHeight, // Use clientHeight
        layout: {
            backgroundColor: 'rgba(30, 35, 45, 0.9)',
            textColor: 'rgba(230, 230, 230, 0.9)',
        },
        grid: {
            vertLines: { color: 'rgba(70, 75, 85, 0.5)' },
            horzLines: { color: 'rgba(70, 75, 85, 0.5)' },
        },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        priceScale: { borderColor: '#485c7b' },
        timeScale: { 
            borderColor: '#485c7b',
            timeVisible: true, // Show time by default
            secondsVisible: false, // Hide seconds if data is not that granular
        },
    });
    candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350',
        borderDownColor: '#ef5350', borderUpColor: '#26a69a',
        wickDownColor: '#ef5350', wickUpColor: '#26a69a',
    });
}

async function loadStockData() {
    try {
        const response = await fetch('/api/stock_data/SPY');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const rawData = await response.json();

        if (rawData.error) {
            console.error("Error fetching stock data:", rawData.error);
            infoBar.dateTime.textContent = `Error: ${rawData.error}`;
            return;
        }
        
        stockData = rawData.map(d => {
            const dateTimeStr = d.Datetime || d.Date;
            const timestamp = Date.parse(dateTimeStr) / 1000;
            return {
                time: timestamp, open: d.Open, high: d.High, low: d.Low, close: d.Close
            };
        }).sort((a, b) => a.time - b.time);

        if (stockData.length > 0) {
            updateChartToCurrentIndex(true);
            updateInfoBar();
        } else {
            infoBar.dateTime.textContent = "No data points to display.";
        }
    } catch (error) {
        console.error('Failed to load stock data:', error);
        infoBar.dateTime.textContent = "Failed to load data.";
    }
}

function updateInfoBar() {
    if (stockData.length === 0 || currentIndex >= stockData.length) return;
    const dp = stockData[currentIndex];
    const date = new Date(dp.time * 1000);
    
    infoBar.dateTime.textContent = date.toLocaleString();
    infoBar.open.textContent = dp.open.toFixed(2);
    infoBar.high.textContent = dp.high.toFixed(2);
    infoBar.low.textContent = dp.low.toFixed(2);
    infoBar.close.textContent = dp.close.toFixed(2);
}

function updateChartToCurrentIndex(isInitialSetup = false) {
    if (stockData.length === 0 || !candleSeries) return;
    const dataSubset = stockData.slice(0, currentIndex + 1);
    
    if (dataSubset.length > 0) {
        candleSeries.setData(dataSubset);
        if (!isInitialSetup && chart && typeof chart.timeScale === 'function') {
            const timeScale = chart.timeScale();
            const logicalPoints = 50; // Number of candles to try to keep in view
            if (dataSubset.length > logicalPoints) {
                timeScale.setVisibleLogicalRange({
                    from: dataSubset.length - logicalPoints,
                    to: dataSubset.length -1
                 });
            } else {
                timeScale.fitContent();
            }
        } else if (isInitialSetup && chart && typeof chart.timeScale === 'function') {
            chart.timeScale().fitContent();
        }
    } else if (isInitialSetup) {
        candleSeries.setData([]);
    }
}

function stepForward() {
    if (currentIndex < stockData.length - 1) {
        currentIndex++;
        updateChartToCurrentIndex();
        updateInfoBar();
    } else {
        pauseReplay();
        playPauseButton.textContent = "Replay";
        // currentIndex = 0; // Optional: reset to beginning for next play immediately
    }
}

function playReplay() {
    if (stockData.length === 0) return;
    isPlaying = true;
    playPauseButton.textContent = "Pause";
    if (currentIndex >= stockData.length - 1) { // If at end, reset
        currentIndex = 0;
        if(candleSeries) candleSeries.setData([]); // Clear chart visually
    }
    clearInterval(replayInterval); // Clear any existing interval
    replayInterval = setInterval(stepForward, replaySpeed);
}

function pauseReplay() {
    isPlaying = false;
    playPauseButton.textContent = "Play";
    clearInterval(replayInterval);
}

function togglePlayPause() {
    if (isPlaying) pauseReplay();
    else playReplay();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    // Resize chart if its container size is relative
    if (chart) {
        chart.resize(chartElement.clientWidth, chartElement.clientHeight);
    }
}

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime(); // Available if needed for other animations

    controls.update(); // Update orbit controls

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

// Main initialization function
async function main() {
    initThreeJS();
    initChart();
    
    playPauseButton.addEventListener('click', togglePlayPause);
    speedControl.addEventListener('input', (event) => {
        replaySpeed = 1100 - (event.target.value * 100); // Slower = higher value
        if (isPlaying) { // If playing, reset interval with new speed
            pauseReplay();
            playReplay();
        }
    });
    speedControl.value = (1100 - replaySpeed) / 100; // Set initial slider position

    window.addEventListener('resize', onWindowResize);

    await loadStockData(); // Load data after UI and chart are ready
    animate(); // Start the Three.js animation loop
}

// Start the application
main();