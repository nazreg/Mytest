"use strict";

var express = require("express");
var app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
var bodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;
const assert = require("assert");
const moment = require("moment");
const { time } = require("console");

require("dotenv").config();

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

// use server available port or 3000
const PORT = process.env.PORT !== undefined ? process.env.PORT : 3000;

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send("index");
});

// Connection URL
const db_url =
  process.env.MONGOLAB_URI !== undefined
    ? process.env.MONGOLAB_URI
    : "mongodb://localhost:27017";

// Database Name
const dbName =
  process.env.MONGOLAB_DBNAME !== undefined
    ? process.env.MONGOLAB_DBNAME
    : "ackchat";

MongoClient.connect(db_url, { useUnifiedTopology: false })
  .then((client) => {
    console.log("Connected to Database");
    const db = client.db(dbName);
    const users = db.collection("users");

    io.on("connection", (socket) => {
      console.log(`${socket.id} connected`);
      const connectedUsers = Object.keys(io.sockets.sockets);
      // get user's data from local storage
      io.to(socket.id).emit("get-user-data");
      socket.on("send-user-data", (data) => {
        // delete all users with user name
        users
          .deleteMany({ name: data.name })
          .then((result) => {
            // insert one user with user data
            users
              .insertOne({
                id: socket.id,
                name: data.name,
              })
              .then((result) => {
                io.to(socket.id).emit("set-user-data", {
                  id: socket.id,
                  name: data.name,
                });
                // send out new user-list
                users
                  .find()
                  .toArray()
                  .then((results) => {
                    io.emit("user-list", results);
                  })
                  .catch((error) => console.error(error));
              })
              .catch((error) => console.error(error));
          })
          .catch((error) => console.error(error));
      });

      // message received
      socket.on("message", (msg) => {
        users
          .findOne({ id: socket.id })
          .then((result) => {
            if (result != undefined) {
              msg.username = result.name;
              msg.time = moment().format("h:mm a");
              io.emit("message", msg);
            }
          })
          .catch((error) => console.error(error));
      });

      // messasage is typing
      socket.on("typing", function (data) {
        socket.broadcast.emit("is typing", data);
      });

      // we have a new user
      socket.on("new-user", (username, time) => {
        socket.username = username;
        time = moment().format("h:mm a");
        users
          .deleteMany({ name: username })
          .then((result) => {
            // add user to db
            users
              .insertOne({
                id: socket.id,
                name: username,
              })
              .then((result) => {
                console.log(`${username} added to db`);
                io.to(socket.id).emit("set-user-data", {
                  id: socket.id,
                  name: username,
                });
                io.emit("new-user", username, time);
                // send user list back to all users
                users
                  .find()
                  .toArray()
                  .then((results) => {
                    io.emit("user-list", results);
                  })
                  .catch((error) => console.error(error));
              })
              .catch((error) => console.error(error));
          })
          .catch((error) => console.error(error));
      });

      // a user has disconnected
      socket.on("disconnect", () => {
        console.log(`${socket.id} disconnected`);
        users
          .findOne({ id: socket.id })
          .then((result) => {
            if (result != undefined) {
              result.time = moment().format("h:mm a");
              io.emit("user-left", result);
            }
          })
          .catch((error) => console.error(error));
        users
          .deleteMany({ id: socket.id })
          .then((result) => {})
          .catch((error) => console.error(error));
        // send user list back to all users
        users
          .find()
          .toArray()
          .then((results) => {
            io.emit("user-list", results);
          })
          .catch((error) => console.error(error));
      });
    });
  })
  .catch(console.error);

//using PORT define above
http.listen(PORT, () => {
  console.log("listening on *:3000");
});
