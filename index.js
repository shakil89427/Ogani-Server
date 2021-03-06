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
  const token = req.headers.authorization.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.userinfo = decoded;
    req.token = token;
    next();
  } catch (error) {
    res.send(false);
  }
};

async function run() {
  /* Load All Products */

  app.post("/allproducts", async (req, res) => {
    try {
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
    } catch (error) {
      res.send(false);
    }
  });

  /* Load product details and related products */

  app.get("/productdetails/:id", async (req, res) => {
    try {
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
    } catch (error) {
      res.send(false);
    }
  });

  /* Load Cart Products */

  app.post("/cartproducts", async (req, res) => {
    try {
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
    } catch (error) {
      res.send(false);
    }
  });

  /* Save the Cart */

  app.post("/savecart", async (req, res) => {
    try {
      await client.connect();
      const data = req.body;
      const database = client.db("carts");
      const cart = database.collection("allcarts");
      const query = { _id: data._id };
      const options = { upsert: true };
      const updateDoc = { $set: data };
      const result = await cart.updateOne(query, updateDoc, options);
      res.send(result);
    } catch (error) {
      res.send(false);
    }
  });

  /* Get Single Cart */

  app.get("/getcart/:id", async (req, res) => {
    try {
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
    } catch (error) {
      res.send(false);
    }
  });

  /* Place Order */

  app.post("/placeorder", async (req, res) => {
    try {
      await client.connect();
      const data = req.body;
      const cartDb = client.db("carts");
      const carts = cartDb.collection("allcarts");
      const orderDb = client.db("orders");
      const orders = orderDb.collection("allorders");
      const query = { _id: data.user._id };
      const place = await orders.insertOne(data);
      const remove = await carts.deleteOne(query);
      if (remove.deletedCount === 1) {
        res.send(true);
      } else {
        res.send(false);
      }
    } catch (error) {
      res.send(false);
    }
  });

  /* Get Order */

  app.get("/loadorders/:id", async (req, res) => {
    try {
      await client.connect();
      const value = req.params.id;
      const orderDb = client.db("orders");
      const orders = orderDb.collection("allorders");
      const find = orders.find({});
      const response = await find.toArray();
      if (value === "admin") {
        res.send(response);
      } else {
        const data = [];
        for (const order of response) {
          if (order.user._id === value) {
            data.push(order);
          }
        }
        res.send(data);
      }
    } catch (error) {
      res.send(false);
    }
  });

  /* Cancel Order */

  app.get("/cancelorder/:id", async (req, res) => {
    try {
      await client.connect();
      const id = req.params.id;
      const orderDb = client.db("orders");
      const orders = orderDb.collection("allorders");
      const updateDoc = { $set: { status: "cancelled" } };
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const result = await orders.updateOne(filter, updateDoc, options);
      res.send(true);
    } catch (error) {
      res.send(false);
    }
  });

  /* Complete Order */
  app.get("/completeorder/:id", async (req, res) => {
    try {
      await client.connect();
      const id = req.params.id;
      const orderDb = client.db("orders");
      const orders = orderDb.collection("allorders");
      const updateDoc = { $set: { status: "completed" } };
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const result = await orders.updateOne(filter, updateDoc, options);
      res.send(true);
    } catch (error) {
      res.send(false);
    }
  });

  /* Signup */

  app.post("/signup", async (req, res) => {
    try {
      await client.connect();
      let user = req.body;
      const database = client.db("users");
      const users = database.collection("allusers");
      const exist = await users.findOne({ email: user.email });
      if (exist?.email) {
        res.send(false);
      } else {
        const encryptedPassword = await bcrypt.hash(user.password, 10);
        user.password = encryptedPassword;
        const { password2, ...rest } = user;
        const inserted = await users.insertOne(rest);
        if (inserted?.acknowledged) {
          const token = jwt.sign(
            { email: user.email },
            process.env.SECRET_KEY,
            {
              expiresIn: "900s",
            }
          );
          res.send({ token });
        } else {
          res.send(false);
        }
      }
    } catch (error) {
      res.send(false);
    }
  });

  /* Login */
  app.post("/login", async (req, res) => {
    try {
      await client.connect();
      const database = client.db("users");
      const users = database.collection("allusers");
      const user = await users.findOne({ email: req.body.email });
      if (user?.email) {
        const validPassword = await bcrypt.compare(
          req.body.password,
          user.password
        );
        if (validPassword) {
          const token = jwt.sign(
            { email: req.body.email },
            process.env.SECRET_KEY,
            {
              expiresIn: "900s",
            }
          );
          res.send({ token });
        } else {
          res.send(false);
        }
      } else {
        res.send(false);
      }
    } catch (error) {
      res.send(false);
    }
  });

  /* Get user by token */
  app.get("/getuser", guard, async (req, res) => {
    try {
      await client.connect();
      const email = req.userinfo.email;
      const database = client.db("users");
      const cart = database.collection("allusers");
      const result = await cart.findOne({ email });
      if (result) {
        const { password, ...rest } = result;
        const token = jwt.sign({ email }, process.env.SECRET_KEY, {
          expiresIn: "900s",
        });
        res.send({ token, rest });
      } else {
        res.send(false);
      }
    } catch (error) {
      res.send(false);
    }
  });

  /* Update user */
  app.post("/updateuser", async (req, res) => {
    try {
      await client.connect();
      const { email, ...rest } = req.body;
      const database = client.db("users");
      const users = database.collection("allusers");
      const filter = { email };
      const options = { upsert: true };
      const updateDoc = { $set: rest };
      const result = await users.findOne(filter);
      if (result.email) {
        const response = await users.updateOne(filter, updateDoc, options);
        const response2 = await users.findOne(filter);
        const { password, ...rest } = response2;
        res.send(rest);
      } else {
        res.send(false);
      }
    } catch (error) {
      res.send(false);
    }
  });
  /* Update Password */
  app.post("/updatepass", async (req, res) => {
    try {
      await client.connect();
      const data = req.body;
      const database = client.db("users");
      const users = database.collection("allusers");
      const filter = { email: data.email };
      const result = await users.findOne(filter);
      if (result.email) {
        const validPassword = await bcrypt.compare(
          req.body.oldPassword,
          result.password
        );
        if (validPassword) {
          const encryptedpassword = await bcrypt.hash(data.newPassword, 10);
          const updated = { $set: { password: encryptedpassword } };
          const response = await users.updateOne(filter, updated);
          if (response) {
            res.send(true);
          } else {
            res.send(false);
          }
        } else {
          res.send(false);
        }
      } else {
        res.send(false);
      }
    } catch (error) {
      res.send(false);
    }
  });

  /* Reset Password */
  app.get("/resetpassword/:id", async (req, res) => {
    try {
      await client.connect();
      const user = req.params.id;
      const database = client.db("users");
      const users = database.collection("allusers");
      const exist = await users.findOne({ email: user });
      if (exist?.email) {
        const token = jwt.sign(
          { email: exist?.email },
          process.env.SECRET_KEY,
          {
            expiresIn: "900s",
          }
        );
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
          subject: "Reset Password ???",
          text: `Click the link  to reset your Password.Link is valid for 15 minuites. https://oganishop.netlify.app/reset/${token}`,
        });
        if (response?.messageId) {
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
    } catch (error) {
      res.send(false);
    }
  });
  /* Protected Route */

  app.get("/checkresettoken", guard, async (req, res) => {
    try {
      await client.connect();
      const token = req.token;
      const tokensDb = client.db("tokens");
      const tokens = tokensDb.collection("alltokens");
      const result = await tokens.findOne({ email: req.userinfo.email, token });
      if (result?.token) {
        res.sendStatus(200);
      } else {
        res.send(false);
      }
    } catch (error) {
      res.send(false);
    }
  });

  /* Confirm Password Reset*/
  app.post("/confirmreset", guard, async (req, res) => {
    try {
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
    } catch (error) {
      res.send(false);
    }
  });

  /* Send Email for contact use */

  app.post("/sendemail", async (req, res) => {
    try {
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
      if (response?.messageId) {
        res.sendStatus(200);
      } else {
        res.send(false);
      }
    } catch (error) {
      res.send(false);
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
