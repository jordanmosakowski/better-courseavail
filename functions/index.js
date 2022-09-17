const functions = require("firebase-functions");

const express = require('express');
var cors = require('cors');
var app = express();
const main = express();
main.use('/api/v1', app);

const axios = require('axios');
const querystring = require('querystring');
 
app.use(cors());

app.get('/', function (req, res) {
    res.send('Hello World');
});

app.get('/query', async function (req, res) {
    const query = req.query.query;
    const quarter = req.query.quarter;
    const response = await axios.post(
        "https://www.scu.edu/apps/ws/courseavail/search/" + quarter.toString() +"/all",
        querystring.stringify({
            q: query,
            maxRes: 300
        })
        );
    res.send(response.data);
});

app.get('/info', async function (req, res) {
    const quarter = req.query.quarter;
    const ids = req.query.ids;
    const response = await axios.get("https://www.scu.edu/apps/ws/courseavail/details/" + quarter.toString() + "/all/" + ids);
    res.send(response.data);
});

app.get("/courses", async function (req, res) {
    const response = await axios.get("https://www.scu.edu/apps/ws/courseavail/autocomplete/" + req.query.quarter.toString() +"/all/courses");
    res.send(response.data);
});

app.get("/quarters", async function (req, res) {
    const response = await axios.get("https://www.scu.edu/apps/ws/courseavail/autocomplete/quarters");
    res.send(response.data.results);
})

exports.api = functions.https.onRequest(main);