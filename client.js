const box = document.getElementById("box");

const dice1 = document.getElementById("dice-1"),
    dice2 = document.getElementById("dice-2"),
    dice3 = document.getElementById("dice-3");

function input(question, callback) {
    box.innerHTML =
        `<div class="input">${question}<br><input type="text" id="response"></div><button id="ok">Ok</button>`;
    show();

    const input = document.getElementById("response"),
        button = document.getElementById("ok");

    button.addEventListener("click", () => {
        hide();
        callback(input.value);
    }, { once: true });
}

function output(message) {
    box.innerHTML = `<div class="message">${message}</div>`;
    show();
}

function info(message, callback) {
    box.innerHTML =
        `<div class="message">${message}</div><button id="ok">Ok</button>`;
    show();

    document.getElementById("ok").addEventListener("click", () => {
        hide();
        if (callback) callback();
    }, { once: true });
}

function show() {
    box.style.visibility = "visible";
}

function hide() {
    box.style.visibility = "collapse";
}

const faces = ["rotate3d(0, 0, 1, -90deg)",
                "rotate3d(1, 0, 0, 180deg)",
                "rotate3d(1, 0, 0, 90deg)",
                "rotate3d(1, 0, 0, -90deg)",
                "rotate3d(0, 1, 0, -90deg)",
                "rotate3d(0, 1, 0, 90deg)"];

function roll(dice, results) {
    let start = false;
    function motion(event) {
        const { x, y, z } = event.acceleration;

        if (start && x < 1 && y < 1 && z < 1) {
            window.removeEventListener("devicemotion", motion);
            for (let i = 0; i < dice.length; i++) {
                d.classList.remove("spinning")
                dice[i].style.transform = faces[Number(results[i])];
                socket.send("done");
            }
        } else if (x > 5 && y > 5 && z > 5) {
            start = true;
            for (let d of dice) {
                d.classList.add("spinning");
            }
        }
    }

    window.addEventListener("devicemotion", motion)
}

const players = [];

const socket = new WebSocket(
    window.location.href.replace("http", "ws").replace("https", "wss"),
);

socket.onmessage = (event) => {
    const [command, ...args] = event.data.split(" ");

    if (command == "join") {
        let player = JSON.parse(args.join(" "));
        players.push(player);
        info(`<b>${player.name}</b> nous a rejoint`);
    }

    if (command == "left") {
        let id = args[0];
        players.filter((player) => player.id != id);
    }

    if (command == "rolling") {
        let id = args[0], player = players.find((player) => player.id == id);
        output(`<b>${player.name}</b> est en train de lancer ses dés`);
    }

    if (command == "choosing") {
        let id = args[0], player = players.find((player) => player.id == id);
        output(`<b>${player.name}</b> est en train de choisir ses dés`);
    }

    if (command == "rerolling") {
        let id = args[0],
            des = args[1],
            player = players.find((player) => player.id == id);
        output(`<b>${player.name}</b> est en train de relancer ${des} dé(s)`);
    }

    if (command == "earn") {
        let id = args[0],
            points = args[1],
            player = players.find((player) => player.id == id);
        output(`<b>${player.name}</b> a gagné ${points} point(s)`);
    }

    if (command == "limit") {
        let id = args[0],
            limit = args[1],
            player = players.find((player) => player.id == id);
        output(
            `Pour cette manche, <b>${player.name}</b> a limité à ${limit} lancé(s)`,
        );
    }

    if (command == "rolled") {
        let id = args[0], player = players.find((player) => player.id == id);
        let d1 = args[1], d2 = args[2], d3 = args[3];
        output(`<b>${player.name}</b> a obtenu ${d1}-${d2}-${d3}`);
    }

    if (command == "roll") {
        let nombre = args[0];

        if (nombre == "3") {
            let d1 = args[1], d2 = args[2], d3 = args[3];
            dice1.visibility = "visible";
            dice2.visibility = "visible";
            dice3.visibility = "visible";
            hide();
            roll([dice1, dice2, dice3], [d1, d2, d3]);
        }

        if (nombre == "2") {
            let d1 = args[1], d2 = args[2];
            dice1.visibility = "visible";
            dice2.visibility = "hidden";
            dice3.visibility = "visible";
            hide();
            roll([dice1, dice3], [d1, d2]);
        }

        if (nombre == "1") {
            let d1 = args[1];
            dice1.visibility = "hidden";
            dice2.visibility = "visible";
            dice3.visibility = "hidden";
            hide();
            roll([dice2], [d1]);
        }
    }

    if (command == "choose") {
        input(args.join("/"), (choose) => {
            socket.send(choose)
        })
    }

    if (command == "ready") {
        info("Ready ?", () => {
            socket.send("ready");
        });
    }
};

socket.onopen = () => {
    input("Veuillez choisir un nom", (nom) => {
        socket.send(`name ${nom}`);
    });
};
