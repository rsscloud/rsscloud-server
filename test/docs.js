const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const chai = require("chai");
const chaiHttp = require("chai-http");
const should = chai.should();

const config = require("../config");

const SERVER_URL = process.env.APP_URL || "http://localhost:5337";
const MOCK_SERVER_PORT = process.env.MOCK_SERVER_PORT || 8002;

chai.use(chaiHttp);

describe("Docs", () => {

	it("should return 200", done => {
		chai
			.request(SERVER_URL)
			.get("/docs")
			.end((err, res) => {
				if (err) {
					done(err);
				} else {
					res.should.have.status(200);
					done();
				}
			});
	});

});
