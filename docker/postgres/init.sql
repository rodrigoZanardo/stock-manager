-- One database per service: auth and stock never read each other's tables.
CREATE DATABASE auth;
CREATE DATABASE stock;
