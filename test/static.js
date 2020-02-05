const chai = require("chai");
const chaiHttp = require("chai-http");
const expect = chai.expect;
const SERVER_URL = process.env.APP_URL || "http://localhost:5337";

chai.use(chaiHttp);

describe("Static Pages", () => {

	it("docs should return 200", done => {
		chai
			.request(SERVER_URL)
			.get("/docs")
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				done();
			});
	});

	it("home should return 200", done => {
		chai
			.request(SERVER_URL)
			.get("/")
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				done();
			});
	});

	it("pingForm should return 200", done => {
		chai
			.request(SERVER_URL)
			.get("/pingForm")
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				done();
			});
	});

	it("pleaseNotifyForm should return 200", done => {
		chai
			.request(SERVER_URL)
			.get("/pleaseNotifyForm")
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				done();
			});
	});

	it("viewLog should return 200", done => {
		chai
			.request(SERVER_URL)
			.get("/viewLog")
			.end((err, res) => {
				if (err) {
					return done(err);
				}

				expect(res).status(200);
				done();
			});
	});

});
