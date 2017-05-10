var express = require('express');
var app = express();
var request = require('request');
var bodyParser = require('body-parser');
var SlackClient = require('@slack/client').WebClient;
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

var port = process.env.PORT || 3000;
var apiKey = process.env.ACCUWEATHER_API_KEY;
var goodPollen = "#30AA49";
var badPollen = "#C61A10";
var warningPollen = "#E5C100";
var city;
var state;
var token = process.env.SLACK_API_TOKEN;
var channel;
var web;
var ts;
var user;

app.post('/pollenme', function(req, res) {
	console.log('Message received!\nMessage: '+JSON.stringify(req.body));
	res.status(200);
	var q = req.body.text;
	if(!q || q.len == 0){
		res.send('You must include a location').end();
		return;
	}
	if(q == 'help'){
		return help(req, res);
	}
	var key = '';
	request('http://dataservice.accuweather.com/locations/v1/search?apikey='+apiKey+'&q='+q, function(error, response, body){
		if(error){
			console.log('http://dataservice.accuweather.com/locations/v1/search?apikey='+apiKey+'&q='+q);
			console.log('error accuweather1=%s',error);
			res.status(500).end();
			return;
		}
		if(body){
			var json = JSON.parse(body);
			if(!json || !json[0] || !json[0].Key){
				console.log(json);
				return;
			}
			key = json[0].Key;
			city = json[0].EnglishName;
			state = json[0].AdministrativeArea.EnglishName;
			console.log('city,state='+city+','+state);
			request('http://dataservice.accuweather.com/forecasts/v1/daily/1day/'+key+'?apikey='+apiKey+'&details=true', function(error, response, body){
				if(error){
					console.log('error accuweather2=%s',error);
					res.status(500).end();
					return;
				}
				web = new SlackClient(token);
				var slackMsg = buildSlackResponse(JSON.parse(body), 'ephemeral');
				//sendMessageToSlack(slackMsg);
				res.send(slackMsg).end();
			});
		}
	});
})

app.post('/pollen', function(req, res) {
	console.log('Message received!\nMessage: '+JSON.stringify(req.body));
	res.status(200);
	var q = req.body.text;
	if(!q || q.len == 0){
		res.send('You must include a location').end();
		return;
	}
	if(q == 'help'){
		return help(req, res);
	}
	channel = req.body.channel_id;
	ts = req.body.ts;
	user = req.body.user_name;
	var responseUrl = req.body.response_url;
	var key = '';
	request('http://dataservice.accuweather.com/locations/v1/search?apikey='+apiKey+'&q='+q, function(error, response, body){
		if(error){
			console.log('http://dataservice.accuweather.com/locations/v1/search?apikey='+apiKey+'&q='+q);
			console.log('error accuweather1=%s',error);
			res.status(500).end();
			return;
		}
		if(body){
			var json = JSON.parse(body);
			if(!json || !json[0] || !json[0].Key){
				console.log(json);
				return;
			}
			key = json[0].Key;
			city = json[0].EnglishName;
			state = json[0].AdministrativeArea.EnglishName;
			console.log('city,state='+city+','+state);
			request('http://dataservice.accuweather.com/forecasts/v1/daily/1day/'+key+'?apikey='+apiKey+'&details=true', function(error, response, body){
				if(error){
					console.log('error accuweather2=%s',error);
					res.status(500).end();
					return;
				}
				web = new SlackClient(token);
				var slackMsg = buildSlackResponse(JSON.parse(body));
				sendMessageToSlack(slackMsg);
				res.end();
			});
		}
	});
})

function help(req, res){
	var helpJson = {};
	helpJson['text'] = 'You can reply to this using /pollen or /pollenme with your location. Location can be zip code, city, or anything identifying for the city like Las Vegas,NV or Topeka or 78701. /pollen posts in channel and /pollenme is only visible to you.';
	res.send(helpJson).end();
};

function buildSlackResponse(baseJson, responsetype){
	
	var formattedJson = {};
	formattedJson['as_user'] = false;
	formattedJson['attachments'] = [];
	var airAndPollen = baseJson.DailyForecasts[0].AirAndPollen;
	
	console.log(baseJson.DailyForecasts[0].Link);
	var attachment = {};
	airAndPollen.forEach(function(item, index) {
		attachment['fallback'] = 'Weather failed to load';
		attachment['footer'] = 'Data from accuweather';

		if(item.Name == 'AirQuality'){
			var airQuality = true;
		}
		if(item.Name == 'UVIndex'){
			var uvIndex = true;
		}

		if(airQuality){
			if(item.Category == 'Good'){
				attachment['color'] = goodPollen;
			}else if(item.Category == 'High'){
				attachment['color'] = badPollen;
			}else if (item.Category == 'Low'){
				attachment['color'] = goodPollen;
			}else if(item.Category == 'Moderate'){
				attachment['color'] = warningPollen;
			}
			attachment['title'] = 'Report for '+city+', '+state;
			attachment["title_link"] = baseJson.DailyForecasts[0].Link;
			console.log('user:' + user);
			attachment['text'] = 'Requested by @' + user;
			var temp = baseJson.DailyForecasts[0].Temperature;
			var feelsLike = baseJson.DailyForecasts[0].RealFeelTemperature;
			attachment['fields'] = [
				{
					"title": "Air Quality",
					"value": item.Category,
					"short": true
				},
				{
					"title": "High (Feels like)",
					"value": temp.Maximum.Value + temp.Maximum.Unit + " (" + feelsLike.Maximum.Value + feelsLike.Maximum.Unit + ")",
					"short": true
				},
				{
					"title": "Low (Feels like)",
					"value": temp.Minimum.Value + temp.Minimum.Unit + " (" + feelsLike.Minimum.Value + feelsLike.Minimum.Unit + ")",
					"short": true
				}
			];
		}else if (uvIndex){
			attachment['fields'].push(
				{
					"title": "UV Index",
					"value": item.Category+' ('+item.Value+')',
					"short": true
				}
			);
		}else{
			attachment['fields'].push(
				{
					"title": item.Name + ' (PPM)',
					"value": item.Category+' ('+item.Value+')',
					"short": true
				}
			);
		}
	})
	formattedJson.attachments.push(attachment);
	return formattedJson;
}

function sendMessageToSlack(JSONmessage){
	console.log('Token: ' + token);
	console.log('Channel: ' + channel);
	JSONmessage['channel']= channel;
	JSONmessage['ts'] = ts;
	JSONmessage['response_type']='in_channel';

	web.chat.postMessage(channel, '', JSONmessage, function(err, res){
		if(err){
			console.log('Error: ' + err);
		}else {
			console.log('Message Sent: ', res);
		}
	})
}

var server = app.listen(port, function() {
	var port = server.address().port;

	console.log("listening at port %s", port);
})