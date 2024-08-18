const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

document.getElementById('game-of-life-background').appendChild(canvas);

let width, height;
let resolution = 10;
let cols, rows;
let grid;

function setup() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    cols = Math.floor(width / resolution);
    rows = Math.floor(height / resolution);

    grid = new Array(cols).fill(null).map(() => new Array(rows).fill(0));
    randomizeGrid();
}

function randomizeGrid() {
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            grid[i][j] = Math.random() > 0.7 ? 1 : 0;
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const x = i * resolution;
            const y = j * resolution;

            if (grid[i][j]) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; // Black with slight transparency
                // ctx.shadowColor = '#000'; // Glow color
                ctx.fillRect(x, y, resolution, resolution); // Draw square pixels
            }
        }
    }

    const nextGrid = grid.map(arr => [...arr]);

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const state = grid[i][j];
            const neighbors = countNeighbors(grid, i, j);

            if (state === 0 && neighbors === 3) {
                nextGrid[i][j] = 1;
            } else if (state === 1 && (neighbors < 2 || neighbors > 3)) {
                nextGrid[i][j] = 0;
            }
        }
    }

    grid = nextGrid;

    requestAnimationFrame(draw);
}

function countNeighbors(grid, x, y) {
    let sum = 0;
    for (let i = -1; i < 2; i++) {
        for (let j = -1; j < 2; j++) {
            const col = (x + i + cols) % cols;
            const row = (y + j + rows) % rows;
            sum += grid[col][row];
        }
    }
    sum -= grid[x][y];
    return sum;
}

window.addEventListener('resize', setup);

setup();
draw();
