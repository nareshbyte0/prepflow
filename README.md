# Prepflow

React + Express + MongoDB interview-practice tracker.

## Setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` (or the supported legacy `mongodb` key) and a long random `JWT_SECRET`.
2. Run `npm install` in the root, then `npm run install:all`.
3. Start the app with `npm run dev`.
4. Open `http://localhost:5000`.

Express serves the built React application and its API from one origin and one port. User passwords are hashed with bcrypt, progress is stored per user in MongoDB, and logging out revokes the active JWT session.

## Production

Run `npm run start` to build React and serve it from Express on `http://localhost:5000`. This provides one deployable MERN service: React is the client, Express is the API, and MongoDB stores user accounts and progress.

## MongoDB Atlas DNS troubleshooting

If your local DNS resolver refuses the `mongodb+srv` record, add `DNS_SERVERS=1.1.1.1,8.8.8.8` to `.env` and restart the API. This only changes the resolver used for the SRV lookup; it does not bypass Atlas access controls or credentials.

# prepflow
