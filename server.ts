const REQUIRED_PLAYERS = 2;

interface Player {
    name: string;
    id: string;
    wait: (event: string) => Promise<string[]>;
    send: (event: string, args: string[]) => void;
    socket: WebSocket;
    score: number;
}

const players = new Array<Player>();

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function emit(event: string, args: string[]) {
    console.log(event)
    for (const player of players) {
        player.send(event, args);
    }
}

function roll(number: number) {
    const dice = [];
    for (let i = 0; i < number; i++) {
        dice.push((Math.floor(Math.random() * 6) + 1).toString());
    }
    return dice;
}

function canReroll(rolls: number, limit: number, rerollable: string[]) {
    if (limit == -1) return rolls < 3 && rerollable.length > 0;
    else return rolls < limit && rerollable.length > 0;
}

function getScore(dice: string[]) {
    const combo = dice.sort().reverse().join("");
    if (combo == "421") return 10;
    if (combo == "111") return 7;
    if (combo == "611" || combo == "666") return 6;
    if (combo == "511" || combo == "555") return 5;
    if (combo == "411" || combo == "444") return 4;
    if (combo == "311" || combo == "333") return 3;
    if (combo == "211" || combo == "222") return 2;
    if (combo == "321" || combo == "432" || combo == "543" || combo == "654") return 2;
    if (combo == "221") return -1;
    return 0;
}

async function playTurn(player: Player, limit: number) {
    emit("rolling", [player.id]);

    const dice = roll(3);
    player.send("roll", ["3", ...dice]);
    await player.wait("done");

    let rolls = 1;
    emit("rolled", [player.id, ...dice]);
    await sleep(2000);

    let rerollable = dice;
    while (canReroll(rolls, limit, rerollable)) {
        emit("choosing", [player.id]);
        player.send("choose", [...rerollable]);
        const indexes = await player.wait("choose");

        if (indexes.length == 0) {
            rerollable = [];
            continue;
        }

        emit("rerolling", [player.id, indexes.length.toString()]);
        
        const newDice = roll(indexes.length);
        player.send("roll", [indexes.length.toString(), ...newDice]);
        await player.wait("done");

        rolls += 1;

        rerollable = [];
        for (let i = 0; i < indexes.length; i++) {
            dice[Number(indexes[i])] = newDice[i];
            rerollable.push(newDice[i]);
        }

        emit("rolled", [player.id, ...dice]);
        await sleep(2000);
    }

    let points = getScore(dice);
    player.score += points;
    emit("earn", [player.id, points.toString()]);
    await sleep(2000);

    return rolls;
}

async function playRound() {
    let limit = -1;
    for (const player of players) {
        let reroll = await playTurn(player, limit);

        if (limit == -1) {
            limit = reroll;
            emit("limit", [player.id.toString(), limit.toString()]);
            await sleep(2000);
        }
    }
    emit("ready", []);
    await Promise.all(players.map(player => player.wait("ready")));
}

function gameIsEnd() {
    let end = false;
    for (const { score } of players) {
        if (score >= 21) end = true;
    }
    return end || players.length == 0;
}

async function playGame() {
    while (!gameIsEnd()) {
        await playRound();
        const p = players.shift();
        if (p) players.push(p);
    }
    emit("end", []);
    for (const player of players) {
        players.splice(players.indexOf(player), 1);
        player.socket.close();
    }
}

async function handlerPlayer(player: Player) {
    if (players.length >= REQUIRED_PLAYERS) return player.socket.close();

    players.push(player);
    player.send("you", [player.id]);
    emit("join", [JSON.stringify(player)]);

    for (const p of players) {
        emit("join", [JSON.stringify(p)]);
    }

    player.socket.onclose = () => {
        players.splice(players.indexOf(player), 1);
        emit("left", [player.id.toString()]);
    }

    if (players.length == REQUIRED_PLAYERS) playGame();
}

async function handlerSocket(socket: WebSocket) {
    const promises = new Map<string, (args: string[]) => void>();

    const wait = (event: string) =>
        new Promise<string[]>((resolve) => {
            const oldResolve = promises.get(event);
            if (oldResolve) oldResolve([]);
            promises.set(event, resolve);
        });

    const send = (event: string, args: string[]) => {
        const message = [event, ...args].join(" ");
        socket.send(message);
    };

    socket.onmessage = (event: MessageEvent<string>) => {
        const [command, ...args] = event.data.split(" "),
            resolve = promises.get(command);
        if (resolve) resolve(args);
        promises.delete(command);
    };

    const name = (await wait("name"))[0],
        player: Player = { name, wait, send, score: 0, id: players.length.toString(), socket };
    await handlerPlayer(player);
}

const routes = new Map<string, Uint8Array>();
routes.set("/", Deno.readFileSync("./index.html"));
routes.set("/style.css", Deno.readFileSync("./style.css"));
routes.set("/client.js", Deno.readFileSync("./client.js"));
routes.set("/index.html", Deno.readFileSync("./index.html"));

function handlerWebsocketUpgrade(request: Request) {
    const { socket, response } = Deno.upgradeWebSocket(request);
    handlerSocket(socket);
    return response;
}

function handlerHttpRequest(request: Request) {
    const url = new URL(request.url);
    return new Response(routes.get(url.pathname) || "404");
}

async function handlerHttpRequestEvent(
    { request, respondWith }: Deno.RequestEvent,
) {
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() == "websocket") {
        respondWith(handlerWebsocketUpgrade(request));
    } else {
        respondWith(handlerHttpRequest(request));
    }
}

async function handlerHttpConn(httpConn: Deno.HttpConn) {
    for await (const request of httpConn) {
        handlerHttpRequestEvent(request);
    }
}

const server = Deno.listen({ port: 421 });

for await (const conn of server) {
    handlerHttpConn(Deno.serveHttp(conn));
}
