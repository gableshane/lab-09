'use strict';
//DEPENDENCIES
const PORT = process.env.PORT || 3000;
const pg = require('pg');
const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
app.use(cors());
const superagent = require('superagent');

// GLOBAL VARIABLES
let error = {
  status: 500,
  responseText: 'Sorry, something went wrong',
}
const GEOCODE_API_KEY = process.env.GEOCODE_API_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const EVENTBRITE_API_KEY = process.env.EVENTBRITE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const MOVIE_API_KEY = process.env.MOVIE_API_KEY;
const YELP_API_KEY = process.env.YELP_API_KEY;
let locationSubmitted;

// CONNECT TO SQL
const client = new pg.Client(`${DATABASE_URL}`);
client.on('error', error => console.error(error));
client.connect();

// LOCATION PATH
app.get('/location', (request, res) => {
  let query = request.query.data.toLowerCase();
  let SQL = 'SELECT * FROM location WHERE searchquery=$1'
  client.query( SQL , [query]).then( sql => {
    if (!sql.rows[0]) {
      superagent.get(`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${GEOCODE_API_KEY}`).then(response => {
        const location = response.body.results[0].geometry.location;
        const formAddr = response.body.results[0].formatted_address;
        const searchquery = response.body.results[0].address_components[0].long_name.toLowerCase();
        if (query !== searchquery) {
          errorHandler();
          return null;
        }
        locationSubmitted = new Geolocation(searchquery, formAddr, location);
        res.send(locationSubmitted);
        let insertArr = [searchquery, formAddr, location.lat, location.lng];
        client.query('INSERT INTO location(searchquery, formatted_query, latitude, longitude) VALUES( $1, $2, $3, $4 )', insertArr);
        console.log('found through API');
      })
    } else {
      res.send(sql.rows[0]);
      locationSubmitted = sql.rows[0];
      console.log('found in database');
    }
  });
});

// LOCATION CONSTRUCTOR FUNCTION
function Geolocation(searchquery, formAddr, location) {
  this.searchquery = searchquery;
  this.formatted_query = formAddr;
  this.latitude = location.lat;
  this.longitude = location.lng;
}
// WEATHER PATH
app.get('/weather', (request, response) => {
  superagent.get(`https://api.darksky.net/forecast/${WEATHER_API_KEY}/${locationSubmitted.latitude},${locationSubmitted.longitude}`).then(res => {
    const weatherArr = res.body.daily.data
    const reply = weatherArr.map(byDay => {
      return new Forecast(byDay.summary, byDay.time);
    })
    response.send(reply);
  })
})
// FORECAST CONSTRUCTOR FUNCTION
function Forecast(summary, time) {
  this.forecast = summary;
  this.time = (new Date(time * 1000)).toDateString();
}
app.get('/events', (request, response) => {
  superagent.get(`http://api.eventful.com/json/events/search?where=${locationSubmitted.latitude},${locationSubmitted.longitude}&within=25&app_key=${EVENTBRITE_API_KEY}`).then(res => {
    let events = JSON.parse(res.text);
    let moreEvents = events.events.event
    let eventData = moreEvents.map(event => {
      return new Event(event.url, event.title, event.start_time, event.description)
    })
    response.send(eventData);
  }).catch( function () {
    console.log('banana');
    return null;
  })
})
// EVENT CONSTRUCTOR FUNCTION
function Event(link, name, event_date, summary='none') {
  this.link = link,
  this.name = name,
  this.event_date = event_date,
  this.summary = summary
}
// MOVIE PATH
app.get('/movies', ( request , response ) => {
  superagent.get(`https://api.themoviedb.org/3/search/movie?api_key=${MOVIE_API_KEY}&language=en-US&query=${locationSubmitted.searchquery}&page=1&include_adult=false`).then( results => {
    let container = JSON.parse(results.text);
    let movieData = [];
    container.results.forEach( function ( val , idx ) {
      movieData.push( new Movie(val.original_title, val.overview, val.vote_average, val.backdrop_path, container.popularity, val.release_date));
    });
    try {
      response.send(movieData);
    }
    catch(error) {
      console.log('errrr');
      errorHandler(response)
    }
  })
})
// MOVIE CONSTRUCTOR
function Movie (title, overview, average_votes, image, popularity, released_on) {
  this.title = title;
  this.overview = overview;
  this.average_votes = average_votes;
  this.image_url = 'https://image.tmdb.org/t/p/w500' + image;
  this.popularity = popularity;
  this.released_on = released_on;
}
// YELP PATH
app.get('/yelp', ( request , response ) => {
  superagent.get(`https://api.yelp.com/v3/businesses/search?term="restaurants"&location="${locationSubmitted.searchquery}"`).set( 'Authorization', `BEARER ${YELP_API_KEY}`).then( results => {
    let yelpData = JSON.parse(results.text).businesses;
    let yelpLocations = [];
    yelpData.forEach( function ( val , idx ) {
      yelpLocations.push( new Yelp(val.name, val.image_url, val.rating, val.url))
    })
    try {
      response.send(yelpLocations);
    }
    catch(error) {
      errorHandler(response);
    }
  })
})
// YELP CONSTRUCTOR
function Yelp(name, image_url, rating, url) {
  this.name = name;
  this.image_url = image_url;
  this.rating = rating;
  this.url = url;
}


//ERROR HANDLER
function errorHandler(response) {
  console.log(error);
  response.status(500).send(error);
}




app.listen(PORT, () => {
  console.log(`App is on PORT: ${PORT}`);
});
