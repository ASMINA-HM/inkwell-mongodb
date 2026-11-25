# Inkwell - Full-Stack Blog Application

Node.js + Express + MongoDB (Mongoose) REST API with JWT authentication and a vanilla JS frontend.
Module 03: Database Integration - Codomax Internship.

## Features
- Register and log in (passwords hashed with bcrypt, sessions with JWT)
- Users and blog posts stored in MongoDB
- Home page loads every blog from the database
- Individual blog details page (`post.html?id=...`) with likes and comments
- Dashboard to edit, publish/unpublish and delete your blogs

## Setup
1. Install Node.js and create a free MongoDB Atlas cluster.
2. Copy `.env.example` to `.env` and paste your connection string into `MONGODB_URI`.
3. Run:
```
npm install
npm start
```
4. Open http://localhost:3000

## API
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/register` | No | Create an account |
| POST | `/api/login` | No | Returns `{token, user}` |
| GET | `/api/posts` | Optional | All published posts |
| GET | `/api/posts/mine` | Yes | Your posts, drafts included |
| GET | `/api/posts/:id` | Optional | One post (details page) |
| POST | `/api/posts` | Yes | Create a blog |
| PUT | `/api/posts/:id` | Yes (owner) | Edit or publish/unpublish |
| DELETE | `/api/posts/:id` | Yes (owner) | Delete |
| POST | `/api/posts/:id/like` | Yes | Toggle like |
| POST | `/api/posts/:id/comments` | Yes | Add a comment |

## Database
- `users`: name, email (unique), password (bcrypt hash)
- `posts`: author, title, category, content, status, likes, comments, timestamps
