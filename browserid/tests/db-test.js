#!/usr/bin/env node

const
assert = require('assert'),
vows = require('vows'),
db = require('../lib/db.js'),
temp = require('temp'),
fs = require('fs'),
path = require('path');

var suite = vows.describe('db');
// disable vows (often flakey?) async error behavior
suite.options.error = false;

function addTestsForDriver(driver) {
  var dbPath = temp.path({suffix: '.db'});

  if (driver === 'mysql') {
    // let's check to see if we can connect and render a nice
    // error message if not.  For community members making casual
    // contributions, we should expect that they might not want to
    // set up mysql.
    suite.addBatch({
      "mysql server": {
        topic: function() { db.open({driver: driver, unit_test: true}, this.callback) },
        "accepting connections": function(err) {
          if (err) {
            console.log("MYSQL TESTS WILL FAIL cause cannot connect to a local mysql database (" + err.message + ")");
          }
        },
        "connection closes": {
          topic: function() { db.close(this.callback); },
          "without error": function(err) {
            assert.isUndefined(err);
          }
        }
      }
    });
  }

  suite.addBatch({
    "onReady": {
      topic: function() { db.onReady(this.callback); },
      "works": function(r) { }
    },
    "onReady still": {
      topic: function() { db.onReady(this.callback); },
      "works for more than one caller": function(r) { }
    },
    "opening the database": {
      topic: function() {
        db.open({ driver: driver, unit_test: true, path: dbPath }, this.callback);
      },
      "and its ready": function(r) {
        assert.isUndefined(r);
      },
      "doesn't prevent onReady": {
        topic: function() { db.onReady(this.callback); },
        "from working": function(r) { }
      }
    }
  });

  // caching of secrets between test batches.
  var secret = undefined;

  suite.addBatch({
    "an email address is not reported as staged before it is": {
      topic: function() {
        db.isStaged('lloyd@nowhe.re', this.callback);
      },
      "isStaged returns false": function (r) {
        assert.isFalse(r);
      }
    },
    "an email address is not reported as known before it is": {
      topic: function() {
        db.emailKnown('lloyd@nowhe.re', this.callback);
      },
      "emailKnown returns false": function (r) {
        assert.isFalse(r);
      }
    }
  });

  suite.addBatch({
    "stage a user for creation pending verification": {
      topic: function() {
        db.stageUser({
          email: 'lloyd@nowhe.re',
          pubkey: 'fakepubkey',
          hash: 'fakepasswordhash'
        }, this.callback);
      },
      "staging returns a valid secret": function(r) {
        secret = r;
        assert.isString(secret);
        assert.strictEqual(secret.length, 48);
      }
    }
  });

  suite.addBatch({
    "an email address is reported": {
      topic: function() {
        db.isStaged('lloyd@nowhe.re', this.callback);
      },
      " as staged after it is": function (r) {
        assert.strictEqual(r, true);
      }
    },
    "an email address is not reported": {
      topic: function() {
        db.emailKnown('lloyd@nowhe.re', this.callback);
      },
      " as known when it is only staged": function (r) {
        assert.strictEqual(r, false);
      }
    }
  });

  suite.addBatch({
    "upon receipt of a secret": {
      topic: function() {
        db.gotVerificationSecret(secret, this.callback);
      },
      "gotVerificationSecret completes without error": function (r) {
        assert.strictEqual(r, undefined);
      }
    }
  });

  suite.addBatch({
    "an email address is not reported": {
      topic: function() {
        db.isStaged('lloyd@nowhe.re', this.callback);
      },
      "as staged immediately after its verified": function (r) {
        assert.strictEqual(r, false);
      }
    },
    "an email address is known": {
      topic: function() {
        db.emailKnown('lloyd@nowhe.re', this.callback);
      },
      "when it is": function (r) {
        assert.strictEqual(r, true);
      }
    }
  });

  suite.addBatch({
    "adding keys to email": {
      topic: function() {
        db.addKeyToEmail('lloyd@nowhe.re', 'lloyd@nowhe.re', 'fakepubkey2', this.callback);
      },
      "works": function(r) {
        assert.isUndefined(r);
      }
    }
  });

  suite.addBatch({
    "adding multiple keys to email": {
      topic: function() {
        db.addKeyToEmail('lloyd@nowhe.re', 'lloyd@nowhe.re', 'fakepubkey3', this.callback);
      },
      "works too": function(r) {
        assert.isUndefined(r);
      }
    }
  });

  suite.addBatch({
    "pubkeysForEmail": {
      topic: function() {
        db.pubkeysForEmail('lloyd@nowhe.re', this.callback);
      },
      "returns all public keys properly": function(r) {
        assert.isArray(r);
        assert.strictEqual(r.length, 3);
      }
    }
  });

  suite.addBatch({
    "checkAuth returns": {
      topic: function() {
        db.checkAuth('lloyd@nowhe.re', this.callback);
      },
      "the correct password": function(r) {
        assert.strictEqual(r, "fakepasswordhash");
      }
    }
  });

  suite.addBatch({
    "staging an email": {
      topic: function() {
        db.stageEmail('lloyd@nowhe.re', 'lloyd@somewhe.re', 'fakepubkey4', this.callback);
      },
      "yields a valid secret": function(secret) {
        assert.isString(secret);
        assert.strictEqual(secret.length, 48);
      },
      "then": {
        topic: function(secret) {
          var cb = this.callback;
          db.isStaged('lloyd@somewhe.re', function(r) { cb(secret, r); });
        },
        "makes it visible via isStaged": function(sekret, r) { assert.isTrue(r); },
        "and lets you verify it": {
          topic: function(secret, r) {
            db.gotVerificationSecret(secret, this.callback);
          },
          "successfully": function(r) {
            assert.isUndefined(r);
          },
          "and knownEmail": {
            topic: function() { db.emailKnown('lloyd@somewhe.re', this.callback); },
            "returns true": function(r) { assert.isTrue(r); }
          },
          "and isStaged": {
            topic: function() { db.isStaged('lloyd@somewhe.re', this.callback); },
            "returns false": function(r) { assert.isFalse(r); }
          }
        }
      }
    }
  });

  // exports.emailsBelongToSameAccount
  suite.addBatch({
    "emails do belong to the same account": {
      "is true": { 
        topic: function() {
          db.emailsBelongToSameAccount('lloyd@nowhe.re', 'lloyd@somewhe.re', this.callback);
        },
        "when they do": function(r) {
          assert.isTrue(r);
        }
      },
      "is false": { 
        topic: function() {
          db.emailsBelongToSameAccount('lloyd@anywhe.re', 'lloyd@somewhe.re', this.callback);
        },
        "when they don't": function(r) {
          assert.isFalse(r);
        }
      }
    }
  });

  // exports.getSyncResponse
  suite.addBatch({
    "sync responses": {  
      "are empty": {
        topic: function() {
          db.getSyncResponse('lloyd@nowhe.re',
                             {
                               'lloyd@nowhe.re': 'fakepubkey',
                               'lloyd@somewhe.re': 'fakepubkey4'
                             },
                             this.callback);
        },
        "when everything is in sync": function (err, resp) {
          assert.isUndefined(err);
          assert.isArray(resp.unknown_emails);
          assert.isArray(resp.key_refresh);
          assert.strictEqual(resp.unknown_emails.length, 0);
          assert.strictEqual(resp.key_refresh.length, 0);
        }
      },
      "handles client unknown emails": {
        topic: function() {
          db.getSyncResponse('lloyd@nowhe.re',
                             {
                               'lloyd@nowhe.re': 'fakepubkey'
                             },
                             this.callback);
        },
        "by returning them in the key_refresh list": function (err, resp) {
          assert.isUndefined(err);
          assert.isArray(resp.unknown_emails);
          assert.isArray(resp.key_refresh);
          assert.strictEqual(resp.unknown_emails.length, 0);
          assert.strictEqual(resp.key_refresh.length, 1);
          assert.strictEqual(resp.key_refresh[0], 'lloyd@somewhe.re');
        }
      },
      "handles server unknown emails": {
        topic: function() {
          db.getSyncResponse('lloyd@nowhe.re',
                             {
                               'lloyd@nowhe.re': 'fakepubkey',
                               'lloyd@somewhe.re': 'fakepubkey4',
                               'lloyd@anywhe.re': 'nofakepubkey',
                             },
                             this.callback);
        },
        "by returning them in the unknown_emails list": function (err, resp) {
          assert.isUndefined(err);
          assert.isArray(resp.unknown_emails);
          assert.strictEqual(resp.unknown_emails.length, 1);
          assert.strictEqual(resp.unknown_emails[0], 'lloyd@anywhe.re');
          assert.isArray(resp.key_refresh);
          assert.strictEqual(resp.key_refresh.length, 0);
        }
      },
      "handles server unknown keys": {
        topic: function() {
          db.getSyncResponse('lloyd@nowhe.re',
                             {
                               'lloyd@nowhe.re': 'fakepubkeyINVALID',
                               'lloyd@somewhe.re': 'fakepubkey4'
                             },
                             this.callback);
        },
        "by returning them in the key_refresh list": function (err, resp) {
          assert.isUndefined(err);
          assert.isArray(resp.unknown_emails);
          assert.strictEqual(resp.unknown_emails.length, 0);
          assert.isArray(resp.key_refresh);
          assert.strictEqual(resp.key_refresh.length, 1);
          assert.strictEqual(resp.key_refresh[0], 'lloyd@nowhe.re');
        }
      },
      "handle more than one case at a time": {
        topic: function() {
          db.getSyncResponse('lloyd@nowhe.re',
                             {
                               'lloyd@somewhe.re': 'fakepubkeyINVALID',
                               'lloyd@anywhe.re': 'notreally'
                             },
                             this.callback);
        },
        "when everything is outta sync": function (err, resp) {
          assert.isUndefined(err);
          assert.isArray(resp.unknown_emails);
          assert.strictEqual(resp.unknown_emails.length, 1);
          assert.strictEqual(resp.unknown_emails[0], 'lloyd@anywhe.re');

          assert.isArray(resp.key_refresh);
          assert.strictEqual(resp.key_refresh.length, 2);
          assert.strictEqual(resp.key_refresh[0], 'lloyd@nowhe.re');
          assert.strictEqual(resp.key_refresh[1], 'lloyd@somewhe.re');
        }
      }
    }
  });

  suite.addBatch({
    "removing an existing email": {
      topic: function() {
        db.removeEmail("lloyd@somewhe.re", "lloyd@nowhe.re", this.callback);
      },
      "returns no error": function(r) {
        assert.isUndefined(r);
      },
      "causes emailKnown": {
        topic: function() {
          db.emailKnown('lloyd@nowhe.re', this.callback);
        },
        "to return false": function (r) {
          assert.strictEqual(r, false);
        }
      }
    }
  });

  suite.addBatch({
    "canceling an account": {
      topic: function() {
        db.cancelAccount("lloyd@somewhe.re", this.callback);
      },
      "returns no error": function(r) {
        assert.isUndefined(r);
      },
      "causes emailKnown": {
        topic: function() {
          db.emailKnown('lloyd@somewhe.re', this.callback);
        },
        "to return false": function (r) {
          assert.strictEqual(r, false);
        }
      }
    }
  });

  suite.addBatch({
    "closing the database": {
      topic: function() {
        db.close(this.callback);
      },
      "should work": function(err) {
        assert.isUndefined(err);
      }
    }
  });

  if (driver !== 'mysql') {
    suite.addBatch({
      "remove the database file": {
        topic: function() {
          fs.unlink(dbPath, this.callback);
        },
        "and unlink should not error": function(err) {
          assert.isNull(err);
        },
        "and the file": {
          topic: function() {
            path.exists(dbPath, this.callback);
          },
          "should be missing": function(r) {
            assert.isFalse(r);
          }
        }
      }
    });
  }
}

// test all available drivers
files = fs.readdirSync(path.join(__dirname, "..", "lib"));

files.forEach(function(f) {
  var m = /^db_(.+)\.js$/.exec(f);
  if (m) {
    addTestsForDriver(m[1]);
  }
});

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);

