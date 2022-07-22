const express = require('express');
var cors = require('cors');
var app = express();
const axios = require('axios');
const querystring = require('querystring');
 
app.use(cors());

app.get('/', function (req, res) {
    res.send('Hello World')
});

app.get('/query', async function (req, res) {
    let query = req.query.query;
    let response = await axios.post(
        "https://www.scu.edu/apps/ws/courseavail/search/4400/all",
        querystring.stringify({
            q: query,
            maxRes: 300
        })
        );
    res.send(response.data);
});

app.get('/info', async function (req, res) {
    let ids = req.query.ids;
    let response = await axios.get("https://www.scu.edu/apps/ws/courseavail/details/4400/all/" + ids);
    res.send(response.data);
});

app.get("/courses", async function (req, res) {
    let response = await axios.get("https://www.scu.edu/apps/ws/courseavail/autocomplete/4400/all/courses");
    res.send(response.data);
});

app.listen(3000);