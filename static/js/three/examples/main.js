// static/js/main.js (Conceptual - using Lightweight Charts for simplicity)

let scene, camera, renderer, css2DRenderer;
let chart, candleSeries;
let stockData = [];
let currentIndex = 0;
let replayInterval;
let isPlaying = false;
let replaySpeed = 500; // milliseconds per candle (adjust with slider)

const infoBar = {
    dateTime: document.getElementById('currentDateTime'),
    open: document.getElementById('currentOpen'),
    high: document.getElementById('currentHigh'),
    low: document.getElementById('currentLow'),
    close: document.getElementById('currentClose'),
};
const playPauseButton = document.getElementById('playPauseButton');
const speedControl = document.getElementById('speedControl');

async function init() {
    // Three.js Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Black background

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5; // Adjust camera position

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // CSS2DRenderer for embedding HTML elements (the chart)
    css2DRenderer = new THREE.CSS2DRenderer();
    css2DRenderer.setSize(window.innerWidth, window.innerHeight);
    css2DRenderer.domElement.style.position = 'absolute';
    css2DRenderer.domElement.style.top = '0px';
    document.body.appendChild(css2DRenderer.domElement);

    // Chart Container (HTML element)
    const chartElement = document.getElementById('chartContainer');
    chartElement.style.display = 'block'; // Make it visible for chart library

    // Initialize Chart (Lightweight Charts example)
    chart = LightweightCharts.createChart(chartElement, {
        width: 600, // Match CSS or desired size
        height: 400,
        layout: {
            backgroundColor: '#253248', // Dark theme for chart
            textColor: 'rgba(255, 255, 255, 0.9)',
        },
        grid: {
            vertLines: { color: '#334158' },
            horzLines: { color: '#334158' },
        },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        priceScale: { borderColor: '#485c7b' },
        timeScale: { borderColor: '#485c7b' },
    });
    candleSeries = chart.addCandlestickSeries({
        upColor: '#4bffb5', downColor: '#ff4976',
        borderDownColor: '#ff4976', borderUpColor: '#4bffb5',
        wickDownColor: '#ff4976', wickUpColor: '#4bffb5',
    });

    // Create CSS2DObject for the chart
    const chart3DObject = new THREE.CSS2DObject(chartElement);
    // Position it in the 3D scene (example positions)
    chart3DObject.position.set(0, 0, 0); 
    // You can add it to a plane or another 3D object if you want it to move with something
    scene.add(chart3DObject);

    // Load stock data
    await loadStockData();

    // Setup Controls
    playPauseButton.addEventListener('click', togglePlayPause);
    speedControl.addEventListener('input', (event) => {
        // Speed: 1 (slowest) = 1000ms, 10 (fastest) = 100ms
        replaySpeed = 1100 - (event.target.value * 100);
        if (isPlaying) { // If playing, reset interval with new speed
            pauseReplay();
            playReplay();
        }
    });
    
    // Start animation loop for Three.js
    animateThreeJS();
}

async function loadStockData() {
    try {
        const response = await fetch('/api/stock_data/SPY');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rawData = await response.json();
        if (rawData.error) {
            console.error("Error fetching stock data:", rawData.error);
            infoBar.dateTime.textContent = `Error: ${rawData.error}`;
            return;
        }
        
        // Transform data for Lightweight Charts
        // It needs { time, open, high, low, close }
        // yfinance 'Datetime' might be like '2024-05-27 09:30:00-04:00' (string) or a Timestamp
        // yfinance 'Date' for daily is like '2024-05-27'
        // Lightweight Charts usually prefers UNIX timestamp for time, or 'YYYY-MM-DD' for daily.
        // For hourly/minute data, ensure timestamps are parsed correctly.
        stockData = rawData.map(d => {
            const dateTimeStr = d.Datetime || d.Date;
            // Convert to UNIX timestamp (seconds). Date.parse gives milliseconds.
            const timestamp = Date.parse(dateTimeStr) / 1000; 
            return {
                time: timestamp, 
                open: d.Open,
                high: d.High,
                low: d.Low,
                close: d.Close
            };
        }).sort((a, b) => a.time - b.time); // Ensure data is sorted by time

        if (stockData.length > 0) {
            // Initialize chart with the first data point or a blank state
            updateChartToCurrentIndex(true); // Initial setup
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
    const currentDataPoint = stockData[currentIndex];
    const date = new Date(currentDataPoint.time * 1000); // Convert UNIX timestamp back to Date object
    
    infoBar.dateTime.textContent = date.toLocaleString();
    infoBar.open.textContent = currentDataPoint.open.toFixed(2);
    infoBar.high.textContent = currentDataPoint.high.toFixed(2);
    infoBar.low.textContent = currentDataPoint.low.toFixed(2);
    infoBar.close.textContent = currentDataPoint.close.toFixed(2);
}


function updateChartToCurrentIndex(isInitialSetup = false) {
    if (stockData.length === 0) return;

    // Display data up to the current index
    const dataSubset = stockData.slice(0, currentIndex + 1);
    
    if (dataSubset.length > 0) {
        candleSeries.setData(dataSubset); // Update the series with all data up to current point
        if (!isInitialSetup) {
             // Auto-scroll to the latest candle
            const lastTime = dataSubset[dataSubset.length - 1].time;
            chart.timeScale().scrollToRealTime(); // This might not work perfectly for historical data replay
            // A better way for replay is to fit the content:
            // chart.timeScale().fitContent();
            // Or, if you want to see a fixed window:
            if (dataSubset.length > 10) { // Keep roughly last 10 candles in good view
                 chart.timeScale().setVisibleLogicalRange({
                    from: dataSubset.length - 10, // logical index from
                    to: dataSubset.length -1 // logical index to
                 });
            } else {
                chart.timeScale().fitContent();
            }
        }
    } else if (isInitialSetup) { // If no data yet but it's setup, clear chart
        candleSeries.setData([]);
    }
}


function stepForward() {
    if (currentIndex < stockData.length - 1) {
        currentIndex++;
        updateChartToCurrentIndex();
        updateInfoBar();
    } else {
        pauseReplay(); // End of data
        playPauseButton.textContent = "Replay"; // Reset button
        currentIndex = 0; // Reset for next play
    }
}

function playReplay() {
    if (stockData.length === 0) return;
    isPlaying = true;
    playPauseButton.textContent = "Pause";
    // If at the end, reset to beginning before playing
    if (currentIndex >= stockData.length - 1) {
        currentIndex = 0;
        candleSeries.setData([]); // Clear chart before new play
    }
    replayInterval = setInterval(stepForward, replaySpeed);
}

function pauseReplay() {
    isPlaying = false;
    playPauseButton.textContent = "Play";
    clearInterval(replayInterval);
}

function togglePlayPause() {
    if (isPlaying) {
        pauseReplay();
    } else {
        playReplay();
    }
}

function animateThreeJS() {
    requestAnimationFrame(animateThreeJS);
    // Add any Three.js animations here (e.g., camera movement, object rotation)
    // For example, make the chart slowly rotate or move
    // if (scene.children.find(obj => obj instanceof THREE.CSS2DObject)) {
    //    const chartObj = scene.children.find(obj => obj instanceof THREE.CSS2DObject);
    //    chartObj.rotation.y += 0.001; // Gentle rotation
    // }

    renderer.render(scene, camera);
    css2DRenderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    css2DRenderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// Start the application
init();