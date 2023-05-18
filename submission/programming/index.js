const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const ethers = require('ethers');
const { BigNumber } = require('ethers');
const { User, Asset, Transaction, Balance, ExchangeRate, sequelize } = require('./database');
const { generateToken, verifyToken } = require('./auth');
const app = express();
let cors = require("cors");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
const port = 3000;
app.use(cors());

// Sync the models with database
sequelize.sync().then(() => {
    console.log("Database synced");
}).catch((err) => {
    console.error("Database sync failed:", err);
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

/**
 * @param {username:string,password:string,firstName:string,lastName:string,email:string} req.body
 */
app.post('/register', async (req, res) => {
    //{username,password,firstName,lastName,email}
    const user = req.body;
    user.role = "user";
    const exists = await User.findOne({ where: { username: user.username.toLowerCase() } });
    if (exists) {
        res.status(400).json({ message: "Username already exists" });
        return;
    }
    // encrypt password
    bcrypt.genSalt(10, function (err, salt) {
        bcrypt.hash(user.password, salt, async function (err, hash) {
            user.password = hash;
            // Store hash in your password DB.
            User.create({ username: user.username.toLowerCase(), password: user.password, role: user.role, firstName: user.firstName, lastName: user.lastName, email: user.email })
                .then(() => {
                    res.json({ message: "ok" });
                }).catch((err) => {
                    res.status(500).json({ message: err.message });
                });
        });
    });
});

/**
 * @param {username:string,password:string} req.body
 */
app.post('/login', async (req, res) => {
    // get user from database
    let user = req.body;
    user = await User.findOne({ where: { username: user.username.toLowerCase() } });
    // check user is exists
    if (!user) {
        res.status(400).json({ message: "Username or password is incorrect" });
        return;
    }
    // authenticate
    bcrypt.compare(req.body.password, user.password, function (err, result) {
        if (result) {
            //gen token
            const token = generateToken(user);
            res.send({ token });
        } else {
            res.status(401).json({ message: "Unauthorized" });
        }
    });
});

/**
 * @param {to:string,asset_symbol:string,amount:string} req.body #amount is wei unit 1 ether = 10^18 wei
 */
app.post('/transfer', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // get data from request
        const { to, asset_symbol, amount } = req.body;
        // check amount is valid ether
        if (!ethers.utils.formatEther(amount)) {
            res.status(400).json({ message: "Amount is incorrect" });
            return;
        }
        // check user is exists
        const user = await User.findOne({ where: { username: decoded.username.toLowerCase() } });
        if (!user) {
            res.status(400).json({ message: "Username is incorrect" });
            return;
        }
        // check asset is exists
        const asset = await Asset.findOne({ where: { symbol: asset_symbol } });
        if (!asset) {
            res.status(400).json({ message: "Asset is incorrect" });
            return;
        }
        // check balance is exists
        const balance = await Balance.findOne({ where: { username: user.username, asset_symbol: asset.symbol } });
        if (!balance) {
            res.status(400).json({ message: "Balance is not enough" });
            return;
        }
        // check balance is enough
        if (BigNumber.from(balance.amount).lt(BigNumber.from(amount))) {
            res.status(400).json({ message: "Balance is not enough" });
            return;
        }
        // create transaction
        const transaction = await Transaction.create({ from: user.username, to: to.toLowerCase(), asset_symbol: asset.symbol, amount: BigNumber.from(amount).toString() });
        await transaction.save();
        // update balance
        balance.amount = BigNumber.from(balance.amount.toString()).sub(BigNumber.from(amount)).toString();
        await balance.save();
        // check balance of to
        const toBalance = await Balance.findOne({ where: { username: to.toLowerCase(), asset_symbol: asset.symbol } });
        if (!toBalance) {
            // create balance
            const newBalance = await Balance.create({ username: to.toLowerCase(), asset_symbol: asset.symbol, amount: BigNumber.from(amount).toString() });
            await newBalance.save();
        } else {
            // update balance
            toBalance.amount = BigNumber.from(toBalance.amount.toString()).add(BigNumber.from(amount)).toString();
            await toBalance.save();
        }
        return res.json({ message: "ok" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
});

// get balance of symbol example url : http://localhost:3000/balances/eth
app.get('/balances/:symbol', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // get data from request
        const { symbol } = req.params;
        // get user
        const user = await User.findOne({ where: { username: decoded.username.toLowerCase() } });
        // get balances
        const balance = await Balance.findOne({ where: { username: user.username, asset_symbol: symbol } });
        if (!balance) {
            return res.json({ amount: "0" });
        }
        return res.json({ amount: balance.amount });
    } catch (err) {
        res.status(401).json({ message: "Unauthorized" });
    }
});

/**
 * @param {username:string,asset_symbol:string,amount:string} req.body #amount is wei unit 1 ether = 10^18 wei
 */
app.post('/admin/balances/increase', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        console.log(decoded);
        // check user is admin
        if (decoded.role !== "admin") {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        // get data from request
        const { username, asset_symbol, amount } = req.body;
        // check amount is valid ether
        if (!BigNumber.from(amount)) {
            res.status(400).json({ message: "Amount is incorrect" });
            return;
        }
        // check user is exists
        const user = await User.findOne({ where: { username: username.toLowerCase() } });
        if (!user) {
            res.status(400).json({ message: "Username is incorrect" });
            return;
        }
        // check asset is exists
        const asset = await Asset.findOne({ where: { symbol: asset_symbol.toLowerCase() } });
        if (!asset) {
            res.status(400).json({ message: "Asset is incorrect" });
            return;
        }
        // check balance is exists
        let balance = await Balance.findOne({ where: { username: user.username, asset_symbol: asset.symbol } });
        if (!balance) {
            // create balance
            balance = await Balance.create({ username: user.username, asset_symbol: asset.symbol, amount: BigNumber.from(amount).toString() });
        }
        else {
            // update balance
            balance.amount = BigNumber.from(amount).add(balance.amount).toString();
            await balance.save();
        }
        return res.json({ message: "ok" });
    }
    catch (err) {
        console.log(err);
        if (err.message === "Token is not valid") {
            res.status(401).json({ message: "Unauthorized" });
        }
        else {
            res.status(500).json({ message: "Internal server error" });
        }
    }
});

/**
 * @param {username:string,asset_symbol:string,amount:string} req.body #amount is wei unit 1 ether = 10^18 wei
 */
app.post('/admin/balances/decrease', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // check user is admin
        if (decoded.role !== "admin") {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        // get data from request
        const { username, asset_symbol, amount } = req.body;
        // check amount is valid ether
        if (!BigNumber.from(amount)) {
            res.status(400).json({ message: "Amount is incorrect" });
            return;
        }
        // check user is exists
        const user = await User.findOne({ where: { username: username.toLowerCase() } });
        if (!user) {
            res.status(400).json({ message: "Username is incorrect" });
            return;
        }
        // check asset is exists
        const asset = await Asset.findOne({ where: { symbol: asset_symbol.toLowerCase() } });
        if (!asset) {
            res.status(400).json({ message: "Asset is incorrect" });
            return;
        }
        // check balance is exists
        let balance = await Balance.findOne({ where: { username: user.username, asset_symbol: asset.symbol } });
        if (!balance) {
            res.status(400).json({ message: "Balance is incorrect" });
            return;
        }
        // check balance is enough
        if (BigNumber.from(amount).gt(BigNumber.from(balance.amount))) {
            res.status(400).json({ message: "Balance is not enough" });
            return;
        }
        // update balance
        balance.amount = BigNumber.from(balance.amount).sub(BigNumber.from(amount)).toString();
        await balance.save();
        return res.json({ message: "ok" });
    }
    catch (err) {
        console.log(err);
        if (err.message === "Token is not valid") {
            res.status(401).json({ message: "Unauthorized" });
        }
        else {
            res.status(500).json({ message: "Internal server error" });
        }
    }
});

/**
 * @param {symbol:string,name:string,description:string,decimals:string} req.body
 */
app.post('/admin/assets/create', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // check user is admin
        if (decoded.role !== "admin") {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        // get data from request
        const { symbol, name, description, decimals } = req.body;
        // validate data
        if (!symbol || !name || !description || !decimals) {
            res.status(400).json({ message: "Data is incorrect" });
            return;
        }
        // check asset is exists
        const asset = await Asset.findOne({ where: { symbol: symbol.toLowerCase() } });
        if (asset) {
            res.status(400).json({ message: "Asset is exists" });
            return;
        }
        // create asset
        await Asset.create({ symbol: symbol.toLowerCase(), name, description, decimals });
        return res.json({ message: "ok" });
    }
    catch (err) {
        console.log(err);
        if (err.message === "Token is not valid") {
            res.status(401).json({ message: "Unauthorized" });
        }
        else {
            res.status(500).json({ message: "Internal server error" });
        }
    }
});

/**
 * @param {symbol:string} req.params
 * @param {name:string,description:string,decimals:string} req.body
 */
app.post('/admin/assets/update/:symbol', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // check user is admin
        if (decoded.role !== "admin") {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        // get data from request
        const { symbol } = req.params;
        const { name, description, decimals } = req.body;
        // check asset is exists
        const asset = await Asset.findOne({ where: { symbol: symbol.toLowerCase() } });
        if (!asset) {
            res.status(400).json({ message: "Asset is not exists" });
            return;
        }
        // update asset
        asset.name = name;
        asset.description = description;
        asset.decimals = decimals;
        await asset.save();
        return res.json({ message: "ok" });
    }
    catch (err) {
        console.log(err);
        if (err.message === "Token is not valid") {
            res.status(401).json({ message: "Unauthorized" });
        }
        else {
            res.status(500).json({ message: "Internal server error" });
        }
    }
});

/**
 * @param {symbol:string} req.params
 */
app.post('/admin/assets/delete/:symbol', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // check user is admin
        if (decoded.role !== "admin") {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        // get data from request
        const { symbol } = req.params;
        // check asset is exists
        const asset = await Asset.findOne({ where: { symbol: symbol.toLowerCase() } });
        if (!asset) {
            res.status(400).json({ message: "Asset is not exists" });
            return;
        }
        // delete asset
        await asset.destroy();
        return res.json({ message: "ok" });
    }
    catch (err) {
        console.log(err);
        if (err.message === "Token is not valid") {

            res.status(401).json({ message: "Unauthorized" });
        }
        else {
            res.status(500).json({ message: "Internal server error" });
        }
    }
});

app.get('/admin/assets/list', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // check user is admin
        if (decoded.role !== "admin") {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        const assets = await Asset.findAll();
        const balances = await Balance.findAll();
        const users = await User.findAll();
        // { symbol: string, name: string, description: string, total: string}
        const data = [];
        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            const balance = balances.find(b => b.asset_symbol === asset.symbol);
            let store_balance = 0
            if (balance) {
                store_balance = balance.amount
            }
            // check asset is exists in data
            const index = data.findIndex(d => d.symbol === asset.symbol);
            if (index === -1) {
                // push new asset
                data.push({
                    symbol: asset.symbol,
                    name: asset.name,
                    description: asset.description,
                    decimals: asset.decimals,
                    total: BigNumber.from(store_balance).toString(),
                });
            }
            else {
                // update amount with convert to big number and add to old amount
                data[index].total = BigNumber.from(data[index].total).add(BigNumber.from(balance.amount)).toString();
            }
        }
        return res.json(data);
    }
    catch (err) {
        console.log(err);
        if (err.message === "Token is not valid") {
            res.status(401).json({ message: "Unauthorized" });
        }
        else {
            res.status(500).json({ message: "Internal server error" });
        }
    }
});

/**
 * @param {asset_home_symbol:string,asset_foreign_symbol:string,rate:string} req.body # rate is wei unit
 */
app.post('/admin/exchange/rate', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // check user is admin
        if (decoded.role !== "admin") {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        // get data from request
        const { asset_home_symbol, asset_foreign_symbol, rate } = req.body;
        // check rate is valid ether
        if (!BigNumber.from(rate)) {
            res.status(400).json({ message: "Rate is invalid" });
            return;
        }
        // check asset is exists
        const assetHome = await Asset.findOne({ where: { symbol: asset_home_symbol.toLowerCase() } });
        const assetForeign = await Asset.findOne({ where: { symbol: asset_foreign_symbol.toLowerCase() } });
        if (!assetHome || !assetForeign) {
            res.status(400).json({ message: "Asset is not exists" });
            return;
        }
        // check rate is exists
        const exchangeRate = await ExchangeRate.findOne({ where: { asset_home_symbol: assetHome.symbol, asset_foreign_symbol: assetForeign.symbol } });
        if (!exchangeRate) {
            // create new exchange rate
            await ExchangeRate.create({
                asset_home_symbol: assetHome.symbol,
                asset_foreign_symbol: assetForeign.symbol,
                rate: BigNumber.from(rate).toString()
            });
        }
        else {
            // update exchange rate
            exchangeRate.rate = BigNumber.from(rate).toString();
            await exchangeRate.save();
        }
        return res.json({ message: "ok" });
    }
    catch (err) {
        console.log(err);
        if (err.message === "Token is not valid") {

            res.status(401).json({ message: "Unauthorized" });
        }
        else {
            res.status(500).json({ message: "Internal server error" });
        }
    }
});

app.get('/admin/exchange/rate/list', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        // verify token
        const decoded = verifyToken(token);
        // check user is admin
        if (decoded.role !== "admin") {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        const exchangeRates = await ExchangeRate.findAll();
        return res.json(exchangeRates);
    }
    catch (err) {
        console.log(err);
        if (err.message === "Token is not valid") {
            return res.status(401).json({ message: "Unauthorized" });
        }
        else {
            return res.status(500).json({ message: "Internal server error" });
        }
    }
});

/**
 * @param {username:string,password:string,firstName:string,lastName:string,email:string} req.body
 */
app.post('/admin/register', async (req, res) => {
    const countUser = await User.count();
    if (countUser > 0) {
        res.status(403).json({ message: "Forbidden" });
        return;
    }
    const user = req.body;
    user.role = "admin";
    // encrypt password
    bcrypt.genSalt(10, function (err, salt) {
        bcrypt.hash(user.password, salt, async function (err, hash) {
            user.password = hash;
            // Store hash in your password DB.
            // create user
            User.create(user).then(() => {
                res.json({ message: "ok" });
            }).catch(err => {
                console.log(err);
                res.status(400).json({ message: "Bad request" });
            });
        });
    });
});

app.listen(port, () => {
    console.log(`Simple Wallet Api listening at http://localhost:${port}`);
});
