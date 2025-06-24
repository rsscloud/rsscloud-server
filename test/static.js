const chai = require('chai'),
    chaiHttp = require('chai-http'),
    expect = chai.expect,
    SERVER_URL = process.env.APP_URL || 'http://localhost:5337';

chai.use(chaiHttp);

describe('Static Pages', function() {

    it('docs should return 200', async function() {
        let res = await chai
            .request(SERVER_URL)
            .get('/docs');

        expect(res).status(200);
    });

    it('home should return 200', async function() {
        let res = await chai
            .request(SERVER_URL)
            .get('/');

        expect(res).status(200);
    });

    it('pingForm should return 200', async function() {
        let res = await chai
            .request(SERVER_URL)
            .get('/pingForm');

        expect(res).status(200);
    });

    it('pleaseNotifyForm should return 200', async function() {
        let res = await chai
            .request(SERVER_URL)
            .get('/pleaseNotifyForm');

        expect(res).status(200);
    });

    it('viewLog should return 200', async function() {
        let res = await chai
            .request(SERVER_URL)
            .get('/viewLog');

        expect(res).status(200);
    });

});
