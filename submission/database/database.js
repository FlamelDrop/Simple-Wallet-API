const { Sequelize, DataTypes } = require('sequelize');
const DB_HOST = "db";
const DB_NAME = "simple_wallet";
const DB_USER = "root";
const DB_PASS = "123456";

// Connect to database
const sequelize = new Sequelize(
    DB_NAME,
    DB_USER,
    DB_PASS, {
    host: DB_HOST,
    dialect: 'mysql'
});

const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        allowNull: false
    },
    firstName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    lastName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
});

const Asset = sequelize.define('Asset', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    symbol: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    },
    decimals: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
});

const Balance = sequelize.define('Balance', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    asset_symbol: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    amount: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

const Transaction = sequelize.define('Transaction', {
    from: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    to: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    asset_symbol: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    amount: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

const ExchangeRate = sequelize.define('ExchangeRate', {
    asset_home_symbol: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    asset_foreign_symbol: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    rate: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

module.exports = { User, Asset, Balance, Transaction, ExchangeRate, sequelize };
