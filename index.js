const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
/* Mongodb login */

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rrlhy.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function run() {
  /* Load All Products */
  try {
    app.get("/allproducts", async (req, res) => {
      await client.connect();
      const database = client.db("products");
      const products = database.collection("allproducts");
      const allitems = products.find({});
      const result = await allitems.toArray();
      res.send(result);
    });
  } finally {
    await client.close();
  }

  /* Save the Cart */
  try {
    app.post("/savecart", async (req, res) => {
      await client.connect();
      const data = req.body;
      const database = client.db("carts");
      const cart = database.collection("allcarts");
      const query = { _id: data._id };
      const options = { upsert: true };
      const updateDoc = { $set: data };
      const result = await cart.updateOne(query, updateDoc, options);
      res.send(result);
    });
  } finally {
    await client.close();
  }
  /* Get Single Cart */
  try {
    app.get("/getcart/:id", async (req, res) => {
      await client.connect();
      const id = req.params.id;
      const database = client.db("carts");
      const cart = database.collection("allcarts");
      const query = { _id: id };
      const result = await cart.findOne(query);
      if (result) {
        res.send(result);
      } else {
        res.send(false);
      }
    });
  } finally {
    await client.close();
  }

  /* Signup */
  app.post("/signup", async (req, res) => {
    try {
      await client.connect();
      let user = req.body;
      const database = client.db("users");
      const users = database.collection("allusers");
      const exist = await users.findOne({ email: user.email });
      if (exist) {
        return res.sendStatus(403);
      }
      const encryptedPassword = await bcrypt.hash(user.password, 10);
      user.password = encryptedPassword;
      const { password2, ...rest } = user;
      const result = await users.insertOne(rest);
      if (result.acknowledged) {
        const { password, ...rest } = await users.findOne({
          email: user.email,
        });
        const token = jwt.sign(rest, process.env.SECRET_KEY, {
          expiresIn: "1hr",
        });
        res.status(200).send(token);
      }
    } catch (error) {
      res.send({ message: error.message });
    } finally {
      await client.close();
    }
  });

  /* Login */
  app.post("/login", async (req, res) => {
    try {
      await client.connect();
      const database = client.db("users");
      const users = database.collection("allusers");
      const user = await users.findOne({ email: req.body.email });
      if (user) {
        const validPassword = await bcrypt.compare(
          req.body.password,
          user.password
        );
        if (validPassword) {
          const { password, ...rest } = user;
          const token = jwt.sign(rest, process.env.SECRET_KEY, {
            expiresIn: "1hr",
          });
          res.status(200).send(token);
        } else {
          res.sendStatus(401);
        }
      } else {
        res.sendStatus(401);
      }
    } catch (error) {
      res.send({ message: error.message });
    } finally {
      await client.close();
    }
  });
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server running");
});

app.listen(port, () => {
  console.log("listening to", port);
});
