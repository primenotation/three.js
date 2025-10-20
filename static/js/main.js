import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';

let camera, scene, renderer, stats;
let controls;
let chartPlaneMesh; // The 3D plane that will display the chart
let chartTexture;   // The texture created from the Lightweight Chart

// Lightweight Chart related variables
let lwChart, candleSeries;
const chartContainer = document.getElementById('chartContainer'); // Div for LWChart rendering
const CHART_WIDTH = 800;  // Must match chartContainer CSS or desired texture width
const CHART_HEIGHT = 600; // Must match chartContainer CSS or desired texture height

// Stock data and replay variables
let stockData = [];
let currentIndex = 0;
let replayInterval;
let isPlaying = false;
let replaySpeed = 800;

// UI Elements
const infoBar = {
    dateTime: document.getElementById('currentDateTime'),
    open: document.getElementById('currentOpen'),
    high: document.getElementById('currentHigh'),
    low: document.getElementById('currentLow'),
    close: document.getElementById('currentClose'),
};
const playPauseButton = document.getElementById('playPauseButton');
const speedControl = document.getElementById('speedControl');

init();
animate();

function init() {
    // --- Three.js Scene Setup ---
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 3); // Adjusted camera for better view of the plane
    camera.lookAt(0, 0, 0);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    scene.fog = new THREE.Fog(0x222222, 2, 15);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    stats = new Stats();
    document.body.appendChild(stats.dom);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 1;
    controls.maxDistance = 20;
    controls.target.set(0, 0, 0); // Target the chart plane

    // --- Setup for Chart as Texture ---
    // Ensure chartContainer has fixed dimensions for consistent texture
    if (chartContainer) {
        chartContainer.style.width = `${CHART_WIDTH}px`;
        chartContainer.style.height = `${CHART_HEIGHT}px`;
        // chartContainer.style.visibility = 'hidden'; // Hide the 2D chart if desired
    } else {
        console.error("chartContainer div not found!");
        return;
    }

    initLightweightChart(); // Initialize the 2D chart

    // Create a plane geometry to display the chart texture
    // The plane size should ideally match the aspect ratio of the chart texture
    const planeGeometry = new THREE.PlaneGeometry(CHART_WIDTH / 200, CHART_HEIGHT / 200); // Scale down for scene units

    // Create the texture from the Lightweight Chart's canvas
    // Lightweight Charts renders to a canvas inside its container. We need to find it.
    const lwChartCanvas = chartContainer.querySelector('canvas');
    if (lwChartCanvas) {
        chartTexture = new THREE.CanvasTexture(lwChartCanvas);
        chartTexture.needsUpdate = true; // Initial update
    } else {
        console.error("Canvas element within Lightweight Chart container not found!");
        // Create a placeholder texture
        const placeholderCanvas = document.createElement('canvas');
        placeholderCanvas.width = CHART_WIDTH;
        placeholderCanvas.height = CHART_HEIGHT;
        const ctx = placeholderCanvas.getContext('2d');
        ctx.fillStyle = 'grey';
        ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
        ctx.fillStyle = 'white';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Chart Error', CHART_WIDTH / 2, CHART_HEIGHT / 2);
        chartTexture = new THREE.CanvasTexture(placeholderCanvas);
    }
    
    const chartMaterial = new THREE.MeshBasicMaterial({
        map: chartTexture,
        side: THREE.DoubleSide, // Show texture on both sides of the plane
        transparent: true // If chart background is transparent
    });

    chartPlaneMesh = new THREE.Mesh(planeGeometry, chartMaterial);
    chartPlaneMesh.position.set(0, 0, 0); // Position the chart plane at the origin
    // chartPlaneMesh.rotation.x = -Math.PI / 5; // Optional: Tilt the chart plane
    scene.add(chartPlaneMesh);

    // --- Event Listeners and Initial Data Load ---
    window.addEventListener('resize', onWindowResize);
    if (playPauseButton && speedControl) {
        playPauseButton.addEventListener('click', togglePlayPause);
        speedControl.addEventListener('input', (event) => {
            replaySpeed = 1100 - (event.target.value * 100);
            if (isPlaying) {
                pauseReplay();
                playReplay();
            }
        });
        speedControl.value = Math.max(1, Math.min(10, (1100 - replaySpeed) / 100));
    } else {
        console.error("UI controls not found!");
    }

    loadStockData();
}

function initLightweightChart() {
    if (!chartContainer) return;
    if (typeof LightweightCharts === 'undefined' || LightweightCharts === null) {
        console.error("LightweightCharts library is not available!");
        return;
    }

    console.log('Initializing Lightweight Chart for texture rendering...');
    try {
        lwChart = LightweightCharts.createChart(chartContainer, {
            width: CHART_WIDTH,
            height: CHART_HEIGHT,
            layout: {
                backgroundColor: 'rgba(20, 25, 30, 1)', // Opaque background for texture
                // backgroundColor: 'rgba(0, 0, 0, 0)', // Use if you want chart elements on transparent bg
                textColor: 'rgba(230, 230, 230, 0.9)',
            },
            grid: {
                vertLines: { color: 'rgba(70, 75, 85, 0.5)' },
                horzLines: { color: 'rgba(70, 75, 85, 0.5)' },
            },
            // Important: Disable interactivity on the 2D chart if it's just for texture
            handleScroll: false,
            handleScale: false,
        });

        if (lwChart && typeof lwChart.addCandlestickSeries === 'function') {
            candleSeries = lwChart.addCandlestickSeries({
                upColor: '#26a69a', downColor: '#ef5350',
                borderDownColor: '#ef5350', borderUpColor: '#26a69a',
                wickDownColor: '#ef5350', wickUpColor: '#26a69a',
            });
            console.log('Lightweight Chart and Candlestick series initialized for texture.');
        } else {
            console.error('Failed to initialize Lightweight Chart or addCandlestickSeries. Check LW Chart version (should be 4.2.1).');
        }
    } catch (e) {
        console.error("Error during Lightweight Chart initialization:", e);
    }
}

function updateChartTexture() {
    if (!lwChart || !candleSeries || !chartTexture) return;

    const dataSubset = stockData.slice(0, currentIndex + 1);
    if (dataSubset.length > 0) {
        candleSeries.setData(dataSubset);
        // Ensure the chart fits the data for a good texture
        if (typeof lwChart.timeScale === 'function') {
            const timeScale = lwChart.timeScale();
            const logicalPointsToShow = Math.min(dataSubset.length, 100); // Show more points for texture
            if (dataSubset.length > 1) {
                 timeScale.setVisibleLogicalRange({
                    from: Math.max(0, dataSubset.length - logicalPointsToShow),
                    to: dataSubset.length -1 
                 });
            } else {
                timeScale.fitContent();
            }
        }
    } else {
        candleSeries.setData([]); // Clear chart if no data
    }
    
    // The Lightweight Chart should auto-redraw to its canvas after setData.
    // We need to tell Three.js that the texture content has changed.
    // A small delay might be needed if LWChart redraw is async, but often not.
    // setTimeout(() => { // Optional delay
        chartTexture.needsUpdate = true;
    // }, 50); 
    // console.log("Chart texture marked for update.");
}


async function loadStockData() {
    // ... (Keep your existing loadStockData function, it's good) ...
    // Make sure it calls updateChartTexture() once after data is loaded and chart is ready
    // For example, at the end of the successful data processing block:
    try {
        infoBar.dateTime.textContent = "Loading data...";
        const response = await fetch('/api/stock_data/SPY');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({error: "Failed to parse error response from server"}));
            throw new Error(`HTTP error! status: ${response.status} - ${errorData.error || "Unknown server error"}`);
        }
        const rawData = await response.json();

        if (rawData.error) {
            console.error("API returned an error:", rawData.error);
            infoBar.dateTime.textContent = `Error: ${rawData.error}`;
            stockData = [];
            if(candleSeries) candleSeries.setData([]);
            return;
        }
        
        stockData = rawData.map(d => {
            const dateTimeStr = d.Datetime || d.Date;
            const dateObj = new Date(dateTimeStr); 
            if (isNaN(dateObj.getTime())) { 
                console.warn('Invalid date string encountered:', dateTimeStr);
                return null; 
            }
            const timestamp = dateObj.getTime() / 1000; 
            
            return {
                time: timestamp, 
                open: parseFloat(d.Open), 
                high: parseFloat(d.High), 
                low: parseFloat(d.Low), 
                close: parseFloat(d.Close),
                // Volume is needed if you plan to show volume bars
                volume: parseFloat(d.Volume) 
            };
        }).filter(item => item !== null) 
          .sort((a, b) => a.time - b.time);

        if (stockData.length > 0) {
            currentIndex = 0; 
            updateInfoBar();
            updateChartTexture(); // Initial texture update
            console.log(`Loaded ${stockData.length} data points.`);
        } else {
            infoBar.dateTime.textContent = "No valid data points to display from API.";
            if(candleSeries) candleSeries.setData([]);
        }
    } catch (error) {
        console.error('Failed to load or process stock data:', error);
        infoBar.dateTime.textContent = `Error loading data: ${error.message}`;
        stockData = [];
        if(candleSeries) candleSeries.setData([]);
    }
}

function updateInfoBar() {
    // ... (Keep your existing updateInfoBar function) ...
    if (stockData.length === 0 || currentIndex >= stockData.length) {
        return;
    }
    const dp = stockData[currentIndex];
    if (!dp || typeof dp.time === 'undefined') { 
        console.warn('Current data point or its time is undefined at index:', currentIndex);
        return;
    }
    const date = new Date(dp.time * 1000);
    
    infoBar.dateTime.textContent = date.toLocaleString();
    infoBar.open.textContent = dp.open.toFixed(2);
    infoBar.high.textContent = dp.high.toFixed(2);
    infoBar.low.textContent = dp.low.toFixed(2);
    infoBar.close.textContent = dp.close.toFixed(2);
}

function stepForward() {
    if (currentIndex < stockData.length - 1) {
        currentIndex++;
        updateInfoBar();
        updateChartTexture(); // Update texture on each step
    } else {
        pauseReplay();
        playPauseButton.textContent = "Replay";
    }
}

function playReplay() {
    // ... (Keep your existing playReplay function) ...
    if (stockData.length === 0) {
        infoBar.dateTime.textContent = "No data to play. Try loading again.";
        return;
    }
    isPlaying = true;
    playPauseButton.textContent = "Pause";
    if (currentIndex >= stockData.length - 1) {
        currentIndex = 0;
        if(candleSeries) candleSeries.setData([]); // Clear 2D chart data
        updateInfoBar();
        updateChartTexture(); // Update texture to show cleared or first state
    }
    clearInterval(replayInterval);
    replayInterval = setInterval(stepForward, replaySpeed);
}

function pauseReplay() {
    // ... (Keep your existing pauseReplay function) ...
    isPlaying = false;
    playPauseButton.textContent = "Play";
    clearInterval(replayInterval);
}

function togglePlayPause() {
    // ... (Keep your existing togglePlayPause function) ...
    if (isPlaying) {
        pauseReplay();
    } else {
        if (stockData.length === 0) {
            loadStockData().then(() => {
                if (stockData.length > 0) {
                    playReplay();
                }
            });
        } else {
            playReplay();
        }
    }
}

function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        // Note: Lightweight Chart in chartContainer is fixed size for texture, so no resize needed for it here.
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (stats) stats.update();
    if (controls) controls.update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Start the application
// main().catch(error => { // If main were async, but it's not here
//     console.error("Error in main execution:", error);
// });
// init(); // Call init directly as it now handles async loadStockData
// animate(); // animate is called from init in this structure
