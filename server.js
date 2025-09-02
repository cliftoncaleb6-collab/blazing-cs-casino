const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.json());
app.use(express.static("public"));

let users = [
    { username: "Blazingc", password: "Blazing123", role: "admin", balance: 0, banned: false }
];

let jackpots = {
    wildwest: { amount: 0 },
    cosmic: { amount: 0 },
    pirate: { amount: 0 }
};

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

// SPIN ENDPOINT (JACKPOT GROWS BY BET AMOUNT)
app.post("/spin", (req, res) => {
    const { username, game, bet } = req.body;
    const user = users.find(u => u.username === username);
    if (!user || user.balance < bet || bet < 0.10 || bet > 20.00) {
        return res.status(400).send({ success: false, message: "Invalid bet or balance" });
    }

    user.balance -= bet;
    jackpots[game].amount += bet;

    io.emit("balanceUpdated", { username, balance: user.balance });
    io.emit("jackpotUpdated", { game, amount: jackpots[game].amount });

    res.send({ success: true, balance: user.balance, jackpot: jackpots[game].amount });
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

// START SERVER
const PORT = 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
