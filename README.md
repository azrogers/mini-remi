# mini-remi

A very simple rabb.it alternative. I didn't expect to keep working on this.

## Features

* A single room. All you need.
* Synchronized playback of HTML5 videos hosted on your server or YouTube videos.
* SRT subtitle support.

## Config

Your config file should look like this:
```
{
	// the root url of the app
	"root_url": "https://remi.anime.lgbt/",
	// the folder that contains video and srt files
	"data_folder": "public",
	// the url to the video files relative to the main page
	"data_url": "/",
	// your youtube data api v3 key
	"youtube_api_key": "<key>",
	// a secure random string used for sessions
	"session_secret": "str",
	// the url for the discord-oauth-gateway
	"auth_url": "https://auth.anime.lgbt",
	// the app id for the gateway
	"auth_app_id": "mini-remi",
	// an array of discord user ids that are allowed to access the control panel
	"admins": ["discord user id"],
	// is chat enabled? can be toggled from the control panel
	"chat_enabled": true
}
```