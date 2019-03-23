const express = require("express");
const request = require("request");

const HEX_REGEX = /^[A-Za-z0-9]+$/;

module.exports = function(nconf)
{
	var router = express.Router();

	var authUrl = nconf.get("auth_url") + "auth?appid=" + nconf.get("auth_app_id");

	router.get("/login", (req, res) => res.redirect(authUrl));
	router.get("/callback", (req, res) => {
		var userkey = req.query.userkey;
		if(userkey == null)
		{
			res.send("no userkey provided");
			return;
		}
		else if(!HEX_REGEX.test(userkey))
		{
			res.send("invalid userkey format");
			return;
		}

		request(nconf.get("auth_url") + "auth/verify?userkey=" + userkey, (err, _, body) => {
			if(err)
			{
				console.log(err);
				res.send("auth error");
				return;
			}

			var info = JSON.parse(body);
			if(info.valid)
			{
				req.session.discordId = info.data.id;
				res.redirect(nconf.get("root_url") + "control");
			}
			else
			{
				res.send("invalid user key - already used?");
				return;
			}
		});
	});

	return router;
}