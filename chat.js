const crypto = require("crypto");

var names = {};
var nameToId = {};
var idHashes = {};

var bans = [];
var db = null;

const NAME_LIMIT = 30;
const MAX_MESSAGE = 2000;

function getIdHash(discordId)
{
	if(idHashes[discordId])
	{
		return idHashes[discordId];
	}

	var hash = crypto.createHash("sha256");
	hash.update(discordId);
	return idHashes[discordId] = hash.digest("hex");
}

function findByNameOrId(nameOrId)
{
	nameOrId = nameOrId.trim();

	// this is an id
	if(names[nameOrId])
	{
		return nameOrId;
	}

	return nameToId[nameOrId];
}

function banUser(id, cb)
{
	bans.push(id);
	db.put("chat:bans", JSON.stringify(bans), (err) => {
		cb(err);
	});
}

function unbanUser(id, cb)
{
	bans.splice(bans.indexOf(id), 1);
	db.put("chat:bans", JSON.stringify(bans), (err) => {
		cb(err);
	});
}

function handleCommands(socket, body, discordId, isAdmin)
{
	var parts = body.trim().split(" ");
	var cmd = parts[0].substr(1);

	switch(cmd)
	{
		case "ban":
			if(!isAdmin)
			{
				return socket.emit("chat.sys", { msg: "Command is admin only." });
			}

			if(parts.length < 2)
			{
				return socket.emit("chat.sys", { msg: "Syntax: /ban <name or id>" });
			}

			var name = parts.slice(1).join(" ").toLowerCase().trim();
			var id = findByNameOrId(name);
			if(id == null)
			{
				return socket.emit("chat.sys", { msg: "User not found." });
			}
			else if(bans.indexOf(id) != -1)
			{
				return socket.emit("chat.sys", { msg: "Already banned!" });
			}

			banUser(id, (err) => {
				socket.emit("chat.sys", { msg: "User banned!" });
			});
			break;
		case "unban":
			if(!isAdmin)
			{
				return socket.emit("chat.sys", { msg: "Command is admin only." });
			}

			if(parts.length < 2)
			{
				return socket.emit("chat.sys", { msg: "Syntax: /unban <name or id>" });
			}

			var name = parts.slice(1).join(" ").toLowerCase().trim();
			var id = findByNameOrId(name);
			if(id == null)
			{
				return socket.emit("chat.sys", { msg: "User not found." });
			}
			else if(bans.indexOf(id) == -1)
			{
				return socket.emit("chat.sys", { msg: "User isn't banned!" });
			}

			unbanUser(id, (err) => {
				socket.emit("chat.sys", { msg: "User unbanned!" });
			});
			break;
		default:
			socket.emit("chat.sys", { msg: "Unknown command!" });
	}
}

exports.initializeBans = function(_db, cb)
{
	db = _db;

	db.get("chat:bans", (err, value) => {
		if(err && !err.notFound)
		{
			return cb(err);
		}
		else if(err && err.notFound)
		{
			bans = [];
		}
		else
		{
			bans = JSON.parse(value) || [];
		}

		return cb(null);
	});
}

exports.register = function(socket, nconf, discordId, isAdmin)
{
	if(names[discordId])
	{
		socket.emit("chat.init", { name: names[discordId], id: discordId });
		socket.emit("chat.sys", { msg: `Welcome to the chat, ${names[discordId]}. You can use /name to change your name.` });
	}

	// user has sent in a name
	socket.on("chat.set_name", (msg) => {
		if(!discordId)
		{
			return socket.emit("chat.sys", { msg: "You are not logged in. Refresh the page." });
		}

		var name = msg.name.trim();
		if(!name || name.trim().length == 0 || name.length > NAME_LIMIT)
		{
			socket.emit("chat.sys", { msg: "Invalid name!" });
			return;
		}

		if(nameToId[name])
		{
			return socket.emit("chat.sys", { msg: `The name '${name}' is taken.` });
		}

		// are we changing a name or is this new?
		var hasName = names[discordId];
		if(names[discordId])
		{
			// delete record of previous name
			delete nameToId[names[discordId]];
		}

		names[discordId] = name;
		nameToId[name] = discordId;

		socket.emit("chat.init", { name: name, id: discordId });
		if(!hasName)
		{
			socket.emit("chat.sys", { msg: `Welcome to the chat, ${names[discordId]}. You can use /name to change your name.` });
		}
		else
		{
			socket.emit("chat.sys", { msg: `Name changed to ${names[discordId]}.` });
		}
	});

	// user has sent a message
	socket.on("chat.send_message", (msg) => {
		if(!discordId)
		{
			return socket.emit("chat.sys", { msg: "You are not logged in! Refresh the page." });
		}
		
		if(!nconf.get("chat_enabled"))
		{
			socket.emit("chat.sys", { msg: "Chat is currently disabled!" });
			return;
		}

		var body = msg.body;
		if(!body || body.trim().length == 0)
		{
			socket.emit("chat.sys", { msg: "Can't send a blank message." });
			return;
		}

		if(!names[discordId])
		{
			socket.emit("chat.sys", { msg: "Need to set a name before sending a message." });
			return;
		}

		if(body.length > MAX_MESSAGE)
		{
			socket.emit("chat.sys", { msg: "Max message length: 2000 chars." });
			return;
		}

		// don't allow banned users to post - unless it's to unban (for banning myself :p)
		if(bans.indexOf(discordId) != -1 && !body.trim().startsWith("/unban"))
		{
			return socket.emit("chat.sys", { msg: "You are banned!" });
		}

		// handle command messages
		if(body.trim().startsWith("/") && !body.trim().startsWith("/me"))
		{
			handleCommands(socket, body, discordId, isAdmin);
			return;
		}

		// do some really simple sanitization
		// the client will handle most of it but i don't feel right handing unsanitized html to the client
		body = body.replace(/</g, "&lt;").replace(/>/g, "&gt;");

		var obj = {
			name: names[discordId],
			id: getIdHash(discordId),
			body: body
		};

		socket.emit("chat.message", obj);
		socket.broadcast.emit("chat.message", obj);
	});
}