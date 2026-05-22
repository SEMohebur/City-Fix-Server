const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();

//Admin Sdk Setup
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("dwedw!");
});

async function run() {
  try {
    await client.connect();

    const db = client.db("IssueTracker");
    const issuesCollection = db.collection("issues");
    const usersCollection = db.collection("users");

    // create issue
    app.post("/createIssue", async (req, res) => {
      const newIssue = req.body;
      const result = await issuesCollection.insertOne(newIssue);
      res.send(result);
    });

    // get my all issues by email
    app.get("/myissues", async (req, res) => {
      const email = req.query.email;
      const myAllIssues = await issuesCollection.find({ email }).toArray();
      res.send(myAllIssues);
    });

    // get all issues
    app.get("/allIssues", async (req, res) => {
      const cursor = issuesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // get recent 6 issues
    app.get("/recent6Issues", async (req, res) => {
      const cursor = issuesCollection.find().sort({ createdAt: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    // upvote
    app.patch("/upvote/:id", async (req, res) => {
      const id = req.params.id;
      const { userEmail } = req.body;

      const issue = await issuesCollection.findOne({ _id: new ObjectId(id) });

      if (issue.email === userEmail) {
        return res
          .status(403)
          .send({ message: "You cannot upvote your own issue" });
      }
      // se check kortese user er email age ache kina jodi thake tahole se return kore beriye jabe ar jodi na thake tahole se bojbe upvote korte parbe porer dhape jabe
      if (issue.upvotedUsers?.includes(userEmail)) {
        return res.status(403).send({
          message: "You already upvoted this issue",
        });
      }

      // ekta user er jonno 1ta upvote
      const result = await issuesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $inc: { upvotes: 1 },
          $push: { upvotedUsers: userEmail },
        },
      );
      res.send(result);
    });

    //3 issue count un subscription user condition normal user 3 ta issue create korte parbe er jonno counter count korchi
    app.get("/issueCreateCounter", async (req, res) => {
      const email = req.query.email;

      const count = await issuesCollection.countDocuments({
        email: email,
      });
      res.send({ count });
    });

    // own issue update
    app.patch("/issueUpdate/:id", async (req, res) => {
      const id = req.params.id;
      const updateIssue = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updateIssue,
      };
      const result = await issuesCollection.updateOne(query, update);
      res.send(result);
    });

    //own issue delete
    app.delete("/deleteIssue/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await issuesCollection.deleteOne(query);
      res.send(result);
    });

    //new user collection route
    app.post("/user", async (req, res) => {
      const newUser = req.body;
      newUser.role = "citizen";
      newUser.status = "active";
      newUser.createdAt = new Date();
      const email = newUser.email;

      const userExist = await usersCollection.findOne({ email });
      if (userExist) {
        return res.send({ message: "User already exists" });
      }
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // get single user by email
    app.get("/user", async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const result = await usersCollection.findOne({ email });
      console.log(result);
      if (!result) {
        return res.status(404).json({ message: "User not found" });
      }
      res.send(result);
    });

    // get all user/citizen
    app.get("/getAllUser", async (req, res) => {
      const users = usersCollection.find({ role: "citizen" });
      const result = await users.toArray();
      res.send(result);
    });

    //admin create staff account
    app.post("/createStaff", async (req, res) => {
      try {
        const { displayName, photoURL, email, password } = req.body;

        const existingStaff = await usersCollection.findOne({ email });

        if (existingStaff) {
          return res.status(400).send({
            message: "Staff already exists",
          });
        }
        // firebase auth create
        const firebaseUser = await admin.auth().createUser({
          email,
          password,
          displayName,
          photoURL,
        });

        // database save staff info
        const staffInfo = {
          email,
          displayName,
          photoURL,
          role: "staff",
          createdAt: new Date(),
          firebaseUID: firebaseUser.uid,
        };
        await usersCollection.insertOne(staffInfo);

        res.send({
          success: true,
          message: "Staff created successfully",
        });
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    //get all staff info
    app.get("/getStaffs", async (req, res) => {
      try {
        const staffs = await usersCollection.find({ role: "staff" }).toArray();
        res.send(staffs);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    // delete staff database and firebase auth
    app.delete("/deleteStaff/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const staff = await usersCollection.findOne(query);

        if (!staff) {
          return res.status(404).send({ message: "Staff not found" });
        }
        const mongoresult = await usersCollection.deleteOne(query);

        let firebaseResult = null;
        if (staff.firebaseUID) {
          firebaseResult = await admin.auth().deleteUser(staff.firebaseUID);
        }

        res.send({
          success: true,
          mongoresult,
          firebaseResult,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: error.message });
      }
    });

    //staff asign - update issue
    app.patch("/assignStaff/:id", async (req, res) => {
      const id = req.params.id;
      const assignedStaffUpdate = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: assignedStaffUpdate,
      };
      const result = await issuesCollection.updateOne(query, update);
      res.send(result);
    });

    //issue status panding or reject
    app.patch("/pandingStatusChange/:id", async (req, res) => {
      const id = req.params.id;
      const statusUpdate = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: statusUpdate,
      };
      const result = await issuesCollection.updateOne(query, update);
      res.send(result);
    });

    // user block/unblock
    app.patch("/blockUnblock/:id", async (req, res) => {
      const id = req.params.id;
      const updateStatus = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updateStatus,
      };
      const result = await usersCollection.updateOne(query, update);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
