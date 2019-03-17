var socket = io();
var mediaInfo = {
	state: "stopped",
	pos: 0,
	url: null,
	vtt: null,
	lastUpdate: 0,
	duration: 0
};

function formatPos(pos)
{
	var sec = Math.floor(pos);
	var ms = (pos - sec) * 1000;
	return moment({hour:0,minute:0,second:0,milliseconds:0})
		.seconds(sec)
		.milliseconds(ms)
		.format("HH:mm:ss.S");
}

function updateUI()
{
	$(".control-content").text(mediaInfo.url == null ? "Playing nothing." : "Playing " + mediaInfo.url);
	$(".control-vtt").text(mediaInfo.vtt == null ? "No subtitles." : "Subtitles: " + mediaInfo.vtt);
	if(mediaInfo.state == "stopped")
	{
		$(".control-pos").text("00:00:00.0/00:00:00.0");
	}
	else
	{
		var pos = mediaInfo.pos;
		if(mediaInfo.state == "playing")
		{
			pos += (Date.now() - mediaInfo.lastUpdate) / 1000;
		}
		$(".control-pos").text(formatPos(pos) + "/" + formatPos(mediaInfo.duration));
	}

	if(mediaInfo.state == "paused")
	{
		$(".control-pauseplay").text("Play");
		$(".control-pauseplay").prop("disabled", false);
	}
	else
	{
		$(".control-pauseplay").text("Pause");
		$(".control-pauseplay").prop("disabled", mediaInfo.state != "playing");
	}

	$(".control-stop").text(mediaInfo.state == "stopped" && mediaInfo.url != null ? "Play" : "Stop");
	$(".control-state").text(mediaInfo.state.toUpperCase()[0] + mediaInfo.state.substr(1))
}

socket.on("control.error", (msg) => {
	var elem = $("<p>" + msg.msg + "</p>");
	elem.appendTo($(".errors"));
});

socket.on("sync.update", (msg) => {
	mediaInfo.state = msg.state;
	mediaInfo.pos = msg.pos;
	mediaInfo.duration = msg.duration;
	mediaInfo.url = msg.url;
	mediaInfo.vtt = msg.vtt;
	mediaInfo.lastUpdate = Date.now();

	updateUI();
});

$(".control-seturl").click(() => {
	var url = $(".control-url-input").val();
	if(url.trim().length == 0)
	{
		return;
	}

	socket.emit("control.set_url", { file: url });
	$(".control-url-input").text("");
});

$(".control-setvtt").click(() => {
	var vtt = $(".control-vtt-input").val();
	if(vtt.trim().length == 0 || vtt.substr(-3) != "srt")
	{
		return;
	}

	var vtt = vtt.substr(0, vtt.length - 3) + "vtt";
	socket.emit("control.set_vtt", { vtt: vtt });
	$(".control-vtt-input").text("");
});

$(".control-setpos").click(() => {
	var pos = $(".control-pos-input").val();
	var time = null;
	if(/\d?\d:\d\d:\d\d(\.\d)?/.test(pos))
	{
		time = moment(pos, moment.HTML5_FMT.TIME_MS);
	}
	else if(/\d?\d:\d\d(\.\d)?/.test(pos))
	{
		time = moment(pos, "mm:ss.SSS");
	}
	else if(/\d?\d(\.\d)?/.test(pos))
	{
		time = moment(pos, "ss.SSS");
	}
	else
	{
		return;
	}

	var seconds = time.diff(moment().startOf("day"), "milliseconds") / 1000;
	socket.emit("control.set_pos", { pos: seconds });
	$(".control-pos-input").text("");
});

$(".control-stop").click(() => {
	socket.emit("control.state", { state: mediaInfo.state == "stopped" ? "playing" : "stopped" });
});
$(".control-pauseplay").click(() => {
	socket.emit("control.state", { state: mediaInfo.state == "paused" ? "playing" : "paused" });
});

setInterval(updateUI, 250);