var messageTemplate = Handlebars.compile($("#message-template").html());
var meTemplate = Handlebars.compile($("#me-template").html());
var sysTemplate = Handlebars.compile($("#sys-template").html());

var isInitialized = false;
var username = null;
var discordId = null;
var chatEnabled = true;

function calculateHash(str) 
{
	var hash = 0;
	if(str.length == 0) 
	{
		return hash;
	}

	for(var i = 0; i < str.length; i++) 
	{
		var char = str.charCodeAt(i);
		hash = ((hash<<5)-hash)+char;
		hash = hash & hash;
	}

	return hash;
}

function sanitizeHTML(str) 
{
	var temp = document.createElement('div');
	temp.textContent = str;
	return temp.innerHTML;
};

function calculateColor(str)
{
	var hash = calculateHash(str);
	// between 70% and 95% lightness
	var hex = Math.floor(0.7 * 0xffffff + (hash & 0xffffff) * 0.25);
	return "#" + hex.toString(16).toUpperCase();
}

// adds a message to the UI
function addMessage(msg)
{
	var name = msg.name;
	var color = calculateColor(name + msg.id);
	var body = sanitizeHTML(msg.body).autoLink({ target: "_blank" });
	if(body.trim().startsWith("/me "))
	{
		var body = body.substr(body.indexOf("/me ") + "/me ".length);
		appendMessage(meTemplate({
			name: name,
			color: color,
			body: body
		}));
	}
	else
	{
		appendMessage(messageTemplate({ 
			name: name,
			color: color,
			body: body
		}));
	}
}

function appendMessage(html)
{
	$(".chat-messages").append(html);
	$(".chat-messages").scrollTop($(".chat-messages")[0].scrollHeight);
}

function sendMessage()
{
	var text = $(".chat-input").val();
	if(text.trim().length == 0)
	{
		return;
	}

	$(".chat-input").val("");

	if(username == null)
	{
		socket.emit("chat.set_name", { name: text });
	}
	// we don't send the name command to the server
	else if(text.trim().startsWith("/name "))
	{
		var newName = text.trim().split(" ").slice(1).join(" ");
		socket.emit("chat.set_name", { name: newName });
	}
	else 
	{
		socket.emit("chat.send_message", { body: text });
	}
}

$(".chat-input").attr("placeholder", "Please enter a name.");
$(".chat-submit").text("Set Name");
$(".chat-submit").click(() => {
	sendMessage();
});
$(".chat-input").on("keypress", (e) => {
	if(e.which == 13)
	{
		sendMessage();
	}
});

$(".chat-toggle").click(() => {
	chatEnabled = !chatEnabled;
	if(chatEnabled)
	{
		$(".chat-toggle-icon").removeClass("fa-comment");
		$(".chat-toggle-icon").addClass("fa-comment-slash");
	}
	else
	{
		$(".chat-toggle-icon").removeClass("fa-comment-slash");
		$(".chat-toggle-icon").addClass("fa-comment");
	}

	$(".chat").css("display", chatEnabled ? "flex" : "none");
});

socket.on("chat.init", (msg) => {
	username = msg.name;
	discordId = msg.discordId;
	isInitialized = true;

	$(".chat-header").text("connected as " + username);

	$(".chat-input").attr("placeholder", "your very good message...");
	$(".chat-submit").text("Send");
});

socket.on("chat.sys", (msg) => {
	appendMessage(sysTemplate({
		body: msg.msg
	}));
});

socket.on("chat.message", (msg) => addMessage(msg));