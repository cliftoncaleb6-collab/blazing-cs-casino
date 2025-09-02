const socket = io();
let currentUser = null;

function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            currentUser = username;
            document.getElementById("login").style.display = "none";
            document.getElementById("lobby").style.display = "block";
            document.getElementById("balance").innerText = data.balance.toFixed(2);
            loadJackpots();
        } else {
            document.getElementById("msg").innerText = data.message;
        }
    });
}

function loadJackpots() {
    fetch("/jackpots")
    .then(res => res.json())
    .then(data => {
        let out = "";
        for (const g in data) {
            out += `<p>${g}: ${data[g].amount.toFixed(2)} coins</p>`;
        }
        document.getElementById("jackpots").innerHTML = out;
    });
}

function spin(game) {
    const bet = parseFloat(document.getElementById("bet").value);
    fetch("/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser, game, bet })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById("balance").innerText = data.balance.toFixed(2);
            loadJackpots();
        } else {
            alert(data.message);
        }
    });
}

socket.on("jackpotUpdated", data => {
    loadJackpots();
});

socket.on("balanceUpdated", data => {
    if (data.username === currentUser) {
        document.getElementById("balance").innerText = data.balance.toFixed(2);
    }
});
