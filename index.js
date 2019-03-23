const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const nconf = require("nconf");
const fs = require("fs");
const path = require("path");
const subtitle = require("subtitle");
const sharedSession = require("express-socket.io-session");

const sync = require("./sync");

nconf.file("config.json");

const sessions = require("express-session")({ 
	secret: nconf.get("session_secret"), 
	resave: false, 
	saveUninitialized: false,
	name: "remi.session"
});

app.set("view engine", "pug");
app.use(express.static("public"));
app.use(sessions);

app.use("/auth", require("./auth")(nconf));

io.use(sharedSession(sessions, {
	autoSave: true
}));

// converts an srt in the data folder to a vtt file for html5 video
app.get("/subs/:sub.vtt", (req, res) => {
	var file = path.join(nconf.get("data_folder"), req.params.sub + ".srt");
	fs.readFile(file, 'utf8', (err, data) => {
		if(err)
		{
			res.send("error: " + err);
			return;
		}

		var sub = subtitle.parse(data);
		var vtt = subtitle.stringifyVtt(sub);
		res.header("Content-Type", "text/vtt");
		res.send(vtt);
	})
})

app.get("/control", (req, res) => {
	// not logged in
	if(!req.session.discordId)
	{
		res.redirect(nconf.get("root_url") + "auth/login");
		return;
	}

	// not admin
	if(nconf.get("admins").indexOf(req.session.discordId) == -1)
	{
		res.send("not allowed");
		return;
	}

	res.render("control");
});

app.get("/", (req, res) => {
	res.render("index", { config: nconf });
});

sync(io, nconf, (err) => {
	if(err)
	{
		throw err;
	}

	http.listen(9939, () => console.log("Listening on port 9939."));
});