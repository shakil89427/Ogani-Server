const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
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
      const query = { id: id };
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
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server running");
});

app.listen(port, () => {
  console.log("listening to", port);
});
