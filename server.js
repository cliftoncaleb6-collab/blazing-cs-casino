const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const path = require("path");
const crypto = require("crypto");

app.use(express.json());
app.use(express.static("public"));

// Configurable house edge (default 5%) can be set via env HOUSE_EDGE (e.g., 0.05)
const HOUSE_EDGE = parseFloat(process.env.HOUSE_EDGE) || 0.05;
const MIN_BET = 0.10;
const MAX_BET = 20.00;

let users = [
    { username: "Blazingc", password: "Blazing123", role: "admin", balance: 1000.00, banned: false }
];

let jackpots = {
    wildwest: { amount: 0 },
    cosmic: { amount: 0 },
    pirate: { amount: 0 }
};

// Game outcome tables (weights determine probability)
const games = {
    wildwest: [
        { name: 'loss', weight: 700, multiplier: 0 },
        { name: 'small', weight: 250, multiplier: 2 },
        { name: 'big', weight: 40, multiplier: 5 },
        { name: 'mega', weight: 9, multiplier: 20 },
        { name: 'jackpot', weight: 1, jackpot: true }
    ],
    cosmic: [
        { name: 'loss', weight: 650, multiplier: 0 },
        { name: 'small', weight: 270, multiplier: 1.8 },
        { name: 'big', weight: 60, multiplier: 6 },
        { name: 'mega', weight: 19, multiplier: 15 },
        { name: 'jackpot', weight: 1, jackpot: true }
    ],
    pirate: [
        { name: 'loss', weight: 720, multiplier: 0 },
        { name: 'small', weight: 240, multiplier: 2.2 },
        { name: 'big', weight: 30, multiplier: 7 },
        { name: 'mega', weight: 9, multiplier: 25 },
        { name: 'jackpot', weight: 1, jackpot: true }
    ]
};

function weightedPick(outcomes) {
    const total = outcomes.reduce((s, o) => s + o.weight, 0);
    const r = crypto.randomInt(0, total);
    let acc = 0;
    for (const o of outcomes) {
        acc += o.weight;
        if (r < acc) return o;
    }
    return outcomes[outcomes.length - 1];
}

function toCents(n) {
    return Math.round(n * 100);
}
function fromCents(c) {
    return (c / 100).toFixed(2);
}

// LOGIN ENDPOINT
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).send({ success: false, message: "Invalid credentials" });
    if (user.banned) return res.status(403).send({ success: false, message: "Account banned" });
    res.send({ success: true, role: user.role, balance: user.balance });
});

// CREATE USER ENDPOINT
app.post("/createUser", (req, res) => {
    const { username, password, role } = req.body;
    users.push({ username, password, role, balance: 20.00, banned: false });
    io.emit("usersUpdated", users);
    res.send({ success: true });
});

// UPDATE BALANCE ENDPOINT
app.post("/updateBalance", (req, res) => {
    const { username, amount } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        user.balance += amount;
        io.emit("balanceUpdated", { username, balance: user.balance });
        res.send({ success: true });
    } else {
        res.status(404).send({ success: false });
    }
});

// SPIN ENDPOINT (RNG + configurable house edge)
app.post("/spin", (req, res) => {
    const { username, game, bet } = req.body;
    if (!games[game]) return res.status(400).send({ success: false, message: "Unknown game" });
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).send({ success: false, message: "Invalid user" });

    const betFloat = parseFloat(bet);
    if (Number.isNaN(betFloat) || betFloat < MIN_BET || betFloat > MAX_BET) {
        return res.status(400).send({ success: false, message: `Bet must be between ${MIN_BET} and ${MAX_BET}` });
    }

    if (user.balance < betFloat) {
        return res.status(400).send({ success: false, message: "Insufficient balance" });
    }

    // Take the bet
    user.balance = parseFloat((user.balance - betFloat).toFixed(2));

    // Contribute the bet to the jackpot pool (full bet as before)
    jackpots[game].amount = parseFloat((jackpots[game].amount + betFloat).toFixed(2));

    // Determine outcome
    const outcome = weightedPick(games[game]);

    let payout = 0;
    let jackpotWon = false;
    let jackpotPayout = 0;

    if (outcome.jackpot) {
        // Jackpot: player wins the whole jackpot pool for the game
        jackpotWon = true;
        jackpotPayout = parseFloat(jackpots[game].amount.toFixed(2));
        payout = jackpotPayout;
        jackpots[game].amount = 0; // reset jackpot
    } else if (outcome.multiplier && outcome.multiplier > 0) {
        // Standard payout, apply house edge by scaling multiplier down
        const effectiveMultiplier = outcome.multiplier * (1 - HOUSE_EDGE);
        const rawPayout = betFloat * effectiveMultiplier;
        // Round to cents
        payout = parseFloat(fromCents(toCents(rawPayout)));
    } else {
        payout = 0;
    }

    // Credit payout to user
    user.balance = parseFloat((user.balance + payout).toFixed(2));

    // Emit updates
    io.emit("balanceUpdated", { username, balance: user.balance });
    io.emit("jackpotUpdated", { game, amount: jackpots[game].amount });

    res.send({ success: true, balance: user.balance, payout, jackpotWon, jackpotPayout, jackpot: jackpots[game].amount });
});

// BAN USER ENDPOINT
app.post("/banUser", (req, res) => {
    const { username, reason } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        user.banned = true;
        user.banReason = reason;
        io.emit("userBanned", { username, reason });
        res.send({ success: true });
    } else {
        res.status(404).send({ success: false });
    }
});

// GET JACKPOTS ENDPOINT
app.get("/jackpots", (req, res) => {
    res.send(jackpots);
});

// GET CONFIG (for client to show house edge if desired)
app.get("/config", (req, res) => {
    res.send({ houseEdge: HOUSE_EDGE, minBet: MIN_BET, maxBet: MAX_BET });
});

// START SERVER
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT} (house edge=${HOUSE_EDGE})`));
