const express = require("express");
const request = require("request");

const HEX_REGEX = /^[A-Za-z0-9]+$/;

module.exports = function(nconf)
{
	var router = express.Router();

	var authUrl = nconf.get("auth_url") + "auth?appid=" + nconf.get("auth_app_id");

	router.get("/login", (req, res) => {
		if(req.query.after)
		{
			req.session.afterLogin = req.query.after;
		}

		res.redirect(authUrl);
	});

	router.get("/callback", (req, res) => {
		var userkey = req.query.userkey;
		if(userkey == null)
		{
			res.render("error", { msg: "no userkey provided" });
			return;
		}
		else if(!HEX_REGEX.test(userkey))
		{
			res.render("error", { msg: "invalid userkey format" });
			return;
		}

		request(nconf.get("auth_url") + "auth/verify?userkey=" + userkey, (err, _, body) => {
			if(err)
			{
				console.log(err);
				res.render("error", { msg: "auth error" });
				return;
			}

			var info = JSON.parse(body);
			if(info.valid)
			{
				req.session.discordId = info.data.id;
				res.redirect(nconf.get("root_url") + (req.session.afterLogin || ""));
			}
			else
			{
				res.render("error", { msg: "invalid user key - already used?" });
				return;
			}
		});
	});

	router.get("/logout", (req, res) => res.render("logout"));
	router.post("/logout", (req, res) => {
		req.session.discordId = null;
		res.redirect(nconf.get("root_url"));
	})

	return router;
}