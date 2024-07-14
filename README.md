# auto-post-scheduler

## To set this up:

1. **Create an X developer account**
2. **Create a new app**
3. **Go to the app's settings**
4. **Set up user auth settings:**
    - Callback URL: `http://localhost:3000/callback`
    - Website URL: Doesn't really matter
5. **Create a `.env` file and add API keys:**

    ```plaintext
    TWITTER_CLIENT_ID=your_twitter_client_id
    TWITTER_CLIENT_SECRET=your_twitter_client_secret
    CALLBACK_URL=http://localhost:3000/callback
    ```

    **Make sure your API key has read and write privileges!!**

6. **Install dependencies:**

    ```bash
    npm install
    ```

7. **Run the application:**

    ```bash
    node app.js
    ```