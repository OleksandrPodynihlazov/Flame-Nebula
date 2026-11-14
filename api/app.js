const express = require("express");

const PORT = 3000;
const app = express();
app.use(express.json());


app.listen(PORT, () => {
    console.log("Server is started on port: " + PORT)
});
