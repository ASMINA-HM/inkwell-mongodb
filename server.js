// Inkwell backend: Express REST API + MongoDB (Mongoose) + static frontend.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "inkwell-dev-secret-change-me";
const CATEGORIES = ["Technology", "Lifestyle", "Education", "Travel", "Other"];

app.use(cors());
app.use(express.json());

/* ---------- database models ---------- */
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash, never plain text
}, { timestamps: true });

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  authorName: { type: String, required: true },
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: CATEGORIES, required: true },
  content: { type: String, required: true, trim: true },
  status: { type: String, enum: ["published", "draft"], default: "published" },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [{ name: String, text: String, date: { type: Date, default: Date.now } }],
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);

const SAMPLES = [
  ["Getting started with HTML, CSS and JavaScript", "Technology", "2026-11-01", "Every website is built on three languages. HTML gives it structure, CSS gives it style, and JavaScript makes it interactive.\n\nStart small. Build one page, then add a style, then add one behaviour. Repeat every day."],
  ["Why responsive design matters", "Technology", "2026-11-05", "More than half of web traffic comes from phones. A responsive layout adapts to any screen so every reader gets a good experience.\n\nUse flexible grids, relative units and media queries."],
  ["Five habits of productive students", "Education", "2026-11-10", "Plan your week, study in short focused sessions, and review what you learned before you sleep.\n\nSmall habits add up quickly."],
  ["A weekend in Galle Fort", "Travel", "2026-11-14", "Walk the ramparts at sunset, eat fresh seafood, and wander the lanes of the old fort.\n\nTwo days is enough to feel the place."],
];
async function seed() {
  if ((await Post.countDocuments()) > 0) return;
  await Post.insertMany(SAMPLES.map(([title, category, d, content]) => ({ authorName: "Inkwell Team", title, category, content, createdAt: new Date(d) })));
  console.log("Added sample posts.");
}

/* ---------- helpers ---------- */
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const isEmail = (e) => typeof e === "string" && /^\S+@\S+\.\S+$/.test(e);
const day = (d) => new Date(d).toISOString().slice(0, 10);
const getPost = (id) => (mongoose.isValidObjectId(id) ? Post.findById(id) : null);
const view = (p, uid) => ({
  id: String(p._id), title: p.title, category: p.category, content: p.content, author: p.authorName,
  date: day(p.createdAt), createdAt: p.createdAt, status: p.status,
  likes: p.likes.length, liked: !!uid && p.likes.some((l) => String(l) === uid),
  comments: p.comments.map((c) => ({ name: c.name, text: c.text, date: day(c.date) })),
  mine: !!uid && !!p.author && String(p.author) === uid,
});
function checkPost(b, partial) {
  const has = (k) => !partial || b[k] !== undefined;
  if (has("title") && (typeof b.title !== "string" || b.title.trim().length < 3)) return "Title must be at least 3 characters.";
  if (has("category") && !CATEGORIES.includes(b.category)) return "Choose a valid category.";
  if (has("content") && (typeof b.content !== "string" || b.content.trim().length < 30)) return "Content must be at least 30 characters.";
  if (b.status !== undefined && !["published", "draft"].includes(b.status)) return "Status must be published or draft.";
  return null;
}

/* ---------- auth middleware ---------- */
function readToken(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  try { return jwt.verify(h.slice(7), SECRET); } catch { return null; }
}
const optAuth = (req, _res, next) => { req.user = readToken(req); next(); };
const auth = (req, res, next) => {
  const u = readToken(req);
  if (!u) return res.status(401).json({ error: "Please log in first." });
  req.user = u; next();
};

/* ---------- auth routes ---------- */
app.post("/api/register", wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Name is required." });
  if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (typeof password !== "string" || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (await User.findOne({ email: email.trim().toLowerCase() })) return res.status(409).json({ error: "That email is already registered. Log in instead." });
  await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  res.status(201).json({ message: "Account created." });
}));

app.post("/api/login", wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const u = isEmail(email) && (await User.findOne({ email: email.trim().toLowerCase() }));
  if (!u || typeof password !== "string" || !(await bcrypt.compare(password, u.password))) return res.status(401).json({ error: "Email or password is incorrect." });
  const token = jwt.sign({ id: String(u._id), name: u.name, email: u.email }, SECRET, { expiresIn: "7d" });
  res.json({ token, user: { name: u.name, email: u.email } });
}));

/* ---------- blog routes ---------- */
app.get("/api/posts", optAuth, wrap(async (req, res) => {
  const list = await Post.find({ status: "published" }).sort({ createdAt: -1 });
  res.json(list.map((p) => view(p, req.user?.id)));
}));

app.get("/api/posts/mine", auth, wrap(async (req, res) => {
  const list = await Post.find({ author: req.user.id }).sort({ createdAt: -1 });
  res.json(list.map((p) => view(p, req.user.id)));
}));

app.get("/api/posts/:id", optAuth, wrap(async (req, res) => {
  const p = await getPost(req.params.id);
  if (!p || (p.status !== "published" && String(p.author) !== req.user?.id)) return res.status(404).json({ error: "Post not found." });
  res.json(view(p, req.user?.id));
}));

app.post("/api/posts", auth, wrap(async (req, res) => {
  const b = req.body || {};
  const err = checkPost(b, false);
  if (err) return res.status(400).json({ error: err });
  const p = await Post.create({ author: req.user.id, authorName: req.user.name, title: b.title, category: b.category, content: b.content, status: b.status === "draft" ? "draft" : "published" });
  res.status(201).json(view(p, req.user.id));
}));

app.put("/api/posts/:id", auth, wrap(async (req, res) => {
  const p = await getPost(req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (String(p.author) !== req.user.id) return res.status(403).json({ error: "You can only edit your own posts." });
  const b = req.body || {};
  const err = checkPost(b, true);
  if (err) return res.status(400).json({ error: err });
  for (const k of ["title", "category", "content", "status"]) if (b[k] !== undefined) p[k] = b[k];
  await p.save();
  res.json(view(p, req.user.id));
}));

app.delete("/api/posts/:id", auth, wrap(async (req, res) => {
  const p = await getPost(req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (String(p.author) !== req.user.id) return res.status(403).json({ error: "You can only delete your own posts." });
  await p.deleteOne();
  res.json({ message: "Post deleted." });
}));

app.post("/api/posts/:id/like", auth, wrap(async (req, res) => {
  const p = await getPost(req.params.id);
  if (!p || p.status !== "published") return res.status(404).json({ error: "Post not found." });
  const i = p.likes.findIndex((l) => String(l) === req.user.id);
  if (i >= 0) p.likes.splice(i, 1); else p.likes.push(req.user.id);
  await p.save();
  res.json(view(p, req.user.id));
}));

app.post("/api/posts/:id/comments", auth, wrap(async (req, res) => {
  const p = await getPost(req.params.id);
  if (!p || p.status !== "published") return res.status(404).json({ error: "Post not found." });
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (text.length < 2) return res.status(400).json({ error: "Write a comment first." });
  p.comments.push({ name: req.user.name, text: text.slice(0, 500) });
  await p.save();
  res.status(201).json(view(p, req.user.id));
}));

/* ---------- frontend + errors ---------- */
app.use("/api", (_req, res) => res.status(404).json({ error: "Route not found." }));
app.use(express.static(path.join(__dirname, "public")));
app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
  if (err.code === 11000) return res.status(409).json({ error: "That email is already registered. Log in instead." });
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

/* ---------- start ---------- */
async function start() {
  if (!process.env.MONGODB_URI) {
    console.error("Missing MONGODB_URI. Create a .env file (copy .env.example) and add your MongoDB connection string.");
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");
    await seed();
  } catch (e) {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Inkwell running at http://localhost:${PORT}`));
}
start();
