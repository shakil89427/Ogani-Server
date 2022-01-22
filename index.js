const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
const { gmail } = require("googleapis/build/src/apis/gmail");
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
/* Mongodb login */

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rrlhy.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

/* Auth Guard */
const guard = (req, res, next) => {
  const { token } = req.body;
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.userinfo = decoded;
    next();
  } catch (error) {
    next(error);
  }
};

async function run() {
  /* Load All Products */
  try {
    app.post("/allproducts", async (req, res) => {
      await client.connect();
      const database = client.db("products");
      const products = database.collection("allproducts");
      let { page, ...rest } = req.body.filterBy;
      if (page < 0 || !page) {
        page = 0;
      }
      const allitems = products.find(rest);
      const count = await allitems.count();
      const result = await allitems
        .skip(page * 8)
        .limit(8)
        .toArray();
      if (req.body.featured === 0) {
        const featuredItem = products.find({});
        const count2 = await featuredItem.count();
        const result2 = await featuredItem.skip(count2 - 8).toArray();
        res.send({ count, result, result2 });
      } else {
        res.send({ count, result });
      }
    });
  } finally {
    await client.close();
  }

  /* Load product details and related products */
  try {
    app.get("/productdetails/:id", async (req, res) => {
      await client.connect();
      const id = req.params.id;
      const database = client.db("products");
      const products = database.collection("allproducts");
      const result = await products.findOne({ _id: ObjectId(id) });
      const related = products.find({
        _id: { $ne: ObjectId(id) },
        catagory: result.catagory,
      });
      const result2 = await related.limit(4).toArray();
      res.send({ result, result2 });
    });
  } finally {
    await client.close();
  }

  /* Load Cart Products */
  try {
    app.post("/cartproducts", async (req, res) => {
      await client.connect();
      const data = req.body;
      const database = client.db("products");
      const products = database.collection("allproducts");
      const query = { _id: { $in: [] } };
      for (const item of data) {
        query._id.$in.push(ObjectId(item._id));
      }
      const options = { projection: { _id: 1, name: 1, img: 1, price: 1 } };

      const allitems = products.find(query, options);
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
  try {
    app.post("/signup", async (req, res) => {
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
    });
  } catch (error) {
    res.send({ message: error.message });
  } finally {
    await client.close();
  }

  /* Login */
  try {
    app.post("/login", async (req, res) => {
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
    });
  } catch (error) {
    res.send({ message: error.message });
  } finally {
    await client.close();
  }

  /* Reset Password */

  try {
    app.get("/resetpassword/:id", async (req, res) => {
      await client.connect();
      const user = req.params.id;
      const database = client.db("users");
      const users = database.collection("allusers");
      const exist = await users.findOne({ email: user });
      if (exist) {
        const token = jwt.sign({ email: user }, process.env.SECRET_KEY, {
          expiresIn: "1hr",
        });
        /* Email Top */
        const oAuth2Client = new google.auth.OAuth2(
          process.env.CLIENT_ID,
          process.env.CLIENT_SECRET,
          process.env.REDIRECT_URI
        );
        oAuth2Client.setCredentials({
          refresh_token: process.env.REFRESH_TOKEN,
        });
        const accessToken = await oAuth2Client.getAccessToken();
        const transport = nodemailer.createTransport({
          service: "gmail",
          auth: {
            type: "OAuth2",
            user: "shopogani@gmail.com",
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            refreshToken: process.env.REFRESH_TOKEN,
            accessToken: accessToken,
          },
        });
        const response = await transport.sendMail({
          from: "OganiShop",
          to: user,
          subject: "Reset Password ✔",
          text: `Click the link  to reset your Password.Link is valid for 1 hr. http://localhost:3000/reset/${token}`,
        });
        if (response) {
          const database = client.db("tokens");
          const tokens = database.collection("alltokens");
          await tokens.insertOne({ email: user, token });
          res.sendStatus(200);
        } else {
          res.send(false);
        }
        /* Email Bottom */
      } else {
        res.send(false);
      }
    });
  } catch (error) {
    res.send(false);
  } finally {
    await client.close();
  }
  /* Protected Route */
  try {
    app.post("/checkresettoken", guard, async (req, res) => {
      await client.connect();
      const token = req.body.token;
      const tokensDb = client.db("tokens");
      const tokens = tokensDb.collection("alltokens");
      const result = await tokens.findOne({ email: req.userinfo.email, token });
      if (result) {
        res.sendStatus(200);
      } else {
        res.send(false);
      }
    });
  } catch (error) {
    res.send(false);
  } finally {
    await client.close();
  }

  /* Confirm Password Reset*/

  try {
    app.post("/confirmreset", guard, async (req, res) => {
      await client.connect();
      const usersDb = client.db("users");
      const users = usersDb.collection("allusers");
      const tokensDb = client.db("tokens");
      const tokens = tokensDb.collection("alltokens");
      const result = await users.findOne({ email: req.userinfo.email });
      if (result) {
        const encryptedpassword = await bcrypt.hash(req.body.pass, 10);
        const updated = { $set: { password: encryptedpassword } };
        const findby = { email: result.email };
        const update = await users.updateOne(findby, updated);
        await tokens.deleteMany({ email: result.email });
        if (update?.modifiedCount) {
          res.sendStatus(200);
        } else {
          res.send(false);
        }
      } else {
        res.send(false);
      }
    });
  } catch (error) {
    res.send(false);
  } finally {
    await client.close();
  }

  /* Send Email for contact use */
  try {
    app.post("/sendemail", async (req, res) => {
      const data = req.body;
      const oAuth2Client = new google.auth.OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET,
        process.env.REDIRECT_URI
      );
      oAuth2Client.setCredentials({
        refresh_token: process.env.REFRESH_TOKEN,
      });
      const accessToken = await oAuth2Client.getAccessToken();
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: "shopogani@gmail.com",
          clientId: process.env.CLIENT_ID,
          clientSecret: process.env.CLIENT_SECRET,
          refreshToken: process.env.REFRESH_TOKEN,
          accessToken: accessToken,
        },
      });
      const response = await transport.sendMail({
        from: data.email,
        to: "shopogani@gmail.com",
        subject: data.name,
        text: data.message,
      });
      res.sendStatus(200);
    });
  } catch (error) {
    res.send(false);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server running");
});

app.listen(port, () => {
  console.log("listening to", port);
});
