//import modules
var express = require('express'),
  connect = require('connect'),
  ejs = require('ejs'),
  engine = require('ejs-locals'),
  http = require('http'),
  mongoose = require('mongoose'),
  passport = require('passport'),
  GooglePass = require('passport-google').Strategy,
  GithubPass = require('passport-github').Strategy,
  models = require('./models');

/*
configure server to run locally or on heroku.
run the server with node server.js <mode> <port>
if mode is set to "production", server will connect to the h@b production or test database
and be served up on the heroku url.
if mode is set to "local", server will try to connect to a local mongo instance named habitat
and be served up on localhost:<port>.
mode defaults (if no argument or garbage is provided) to using the test database and local url.
port defaults to 8000
*/
var port = process.argv[3] || 8000,
  heroku_url = "http://habitat.hackersatberkeley.com",
  local_url = "http://localhost:"+port,
  local_db = 'mongodb://localhost:27017/habitat',
  remote_db = process.env.TMPMONGOHQ_URL || "mongodb://hackallnight:yoloswag2013@ds029847.mongolab.com:29847/hab_testing",
  GIT_ID = process.env.gitID || "1771ed921581c00d677e",
  GIT_SECRET = process.env.gitSecret || "f107369fd2c33bbbed9bd25132edbe9df717bdea",
  MONGO_URI = remote_db,
  SITE_URL = local_url;

//console.log(process.argv);

if (process.argv[2] == "production") {
  SITE_URL = heroku_url;
}
else if (process.argv[2] == "local") {
  MONGO_URI = local_db;
}

console.log("h@bitat running at", SITE_URL, "\nconnected to db", MONGO_URI);

// instantiate the app and connect to the database
var app = express(),
    db = mongoose.connect(MONGO_URI);

/* START UTILITY FUNCTIONS */
function errorCallback(err) {
  if (err) {
    console.log(err);
  }
};

function ensureAuthenticated(failureUrl) {
  return function(req, res, next) {
    req.session.redirect_loc = req.url;
    if (req.isAuthenticated()) {
      next();
    } else {
      res.redirect(failureUrl);
    }
  }
}

// TODO: check if this actually makes sense on all things. sometimes they aren't a url at allm, and don't need an http in front of them
function forceAbsolute(url) {
  if (url && url.indexOf('://') < 0) {
    url = "http://" + url;
  }
  return url;
}

function stripSpaces(str) {
  return str.replace(/^\s+|\s+$/g,'');
}

function stripPunct(str) {
  return str.replace(/[^a-zA-Z0-9]+/g, '').replace('/ {2,}/',' ');
}

function shuffle(arr) {
  var m = arr.length, t, i;

  while (m) {
    i = Math.floor(Math.random() * m--);

    t = arr[m];
    arr[m] = arr[i];
    arr[i] = t;
  }

  return arr;
}
/* END UTILITY FUNCTIONS */
app.engine('ejs', engine);

// configure app and modules
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({secret: 'autobahn'}));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/', express.static(__dirname + '/public'));
  app.use(app.router);
  app.use(express.favicon(__dirname + '/public/img/favicon.ico'));
});

// instantiate Mongoose models
var User = mongoose.model('User', models.UserSchema),
	Hack = mongoose.model('Hack', models.HackSchema),
	Event = mongoose.model('Event', models.EventSchema);

/* START AUTHENTICATION FUNCTIONS */
passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(
  new GithubPass({
    clientID: GIT_ID,
    clientSecret: GIT_SECRET,
    callbackURL: SITE_URL+"/auth/github/callback",
  }, function(accessToken, refreshToken, profile, done) {
    User.findOne({"github.id": profile.id}, function(err, doc) {
      if (!doc) {
        doc = new User();
        doc.info.name = profile._json.name;
      }
      doc.github.id = profile.id;
      doc.github.username = profile.username;
      doc.github.url = profile.profileUrl;
      doc.github.avatarUrl = profile._json.avatar_url.split('?')[0];
      doc.github.name = profile._json.name;
      doc.github.email = profile.emails[0]["value"];
      doc.save(errorCallback);
      done(err, doc);
    });
  }
));

app.get('/login', function(req, res, next) {
	//check if we have a url parameter named event
	req.session.redirect_loc = req.query.loc;
	req.session.fail_loc = '/';
	if (req.query.event) {
		Event.findOne({"abbrev": req.query.event}, function(err, doc) {
			if (doc) {
				req.session.eventid = doc._id;
				req.session.redirect_loc = doc.successUrl;
				req.session.fail_loc = doc.failUrl;
			}
			else {
				console.log(err);
			}	
			
			passport.authenticate('github', function(err, user, info) {
				if (err) { 
					return res.redirect(req.session.fail_loc); 
				}
				if (!user) { 
					return res.redirect(req.session.fail_loc); 
				}
				
				req.logIn(user, function(err) {
					return res.redirect(req.session.redirect_loc);
				});
			})(req, res, next);
		});
	}
	else {
		passport.authenticate('github', function(err, user, info) {
			if (err) { 
				return res.redirect(req.session.fail_loc); 
			}
			if (!user) { 
				return res.redirect(req.session.fail_loc); 
			}
			
			req.logIn(user, function(err) {
				return res.redirect(req.session.redirect_loc);
			});
		})(req, res, next);
	}
});

app.get('/auth/github/callback',
  passport.authenticate('github', {
    failureRedirect: '/', //add failure page
  }),
  function(req, res) {
	console.log(req.session);
	if (req.session.eventid) {
		console.log(req.session.eventid)
		Event.update({"_id": req.session.eventid}, 
					{ $addToSet: { "attendees": req.user._id}},
					errorCallback);
	}
    res.redirect(req.session.redirect_loc || '/users/me');
  }
);
/* END AUTHENTICATION FUNCTIONS */

/* START REQUEST HANDLERS */
app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

app.get('/users', function(req, res) {
  User.find({}, function(err, docs) {
    res.render('hackers', {
      title: 'Hackers',
      user: req.user,
      users: shuffle(docs),
    });
  });
});

app.get('/users/:username', function(req, res) {
  function prepare_response(err, doc, myself) {
    if (!myself || myself!=true) {
      myself = false;
    }
    if (err) {
      res.redirect('https://github.com/'+doc.github.username);
    } else {
      Hack.find({
        'team': {
          $all: [doc.github.username],
        }
      }, function(err, docs) {
        res.render('profile', {
          title: 'Profile',
          user: req.user,
          viewing: doc,
          hacks: docs,
          quote: '\"There are few sources of energy so powerful as a procrastinating college student.\" -- paul graham',
          myself: myself
        });
      });
    }
  }
  if (req.params.username == "me") {
    if (req.user) {
      prepare_response(false, req.user, true);
    } else {
      passport.authenticate("github");
    }
  } else {
    if (req.user && req.params.username == req.user.github.username) {
      prepare_response(false, req.user, true);
    } else {
      User.findOne({
        "github.username": req.params.username,
      }, prepare_response);
    }
  }
});

// need to be able to edit profile page
app.post('/users/:username', function(req, res) {
  if (req.params.username == "me") {
    var username = req.user.github.username;
  } else {
    var username = req.params.username;
    if (req.user.github.username != username) {
      res.redirect("/users/"+req.params.username);
    }
  }
    User.findOne({
      "github.username": username
    }, function(err, user) {
      if (err) {
        console.log("Ran into error: "+err);
        res.redirect("/users/me");
      } else {
        user.info.name = req.body.user.name || user.info.name;
        user.info.email = req.body.user.email || user.info.email;
        user.info.blurb = req.body.user.blurb || user.info.blurb;
        user.save(function(e) {
          if (e) {
            console.log("Ran into error: "+e);
          }
        });
      }
    });
});

function project_filter(req, res, page, searchstr) {
  page = page - 1;
  /* Return many objects that correspond to the given page and query. */
  var query = Hack.find({});
  if (searchstr.length > 0) {
    var constraints = [];
    var terms = searchstr.split(' ');
    terms.forEach(function(term) {
      var termrx = new RegExp(term, "i");
      constraints.push({'title': { $regex: termrx}});
      constraints.push({'blurb': { $regex: termrx}});
    });
    constraints.push({'tags': { $in: terms }});
    query.or(constraints);
  }

  query.skip(page * 24);
  query.limit(24);

  query.exec(function(err, docs) {
    res.render('hacks', {
      title: 'Hacks',
      lastPage: docs.length < 24,
      page: page+1,
      user: req.user,
      hacks: shuffle(docs),
    });
  });
};

app.get('/projects', function(req, res) {
  project_filter(req, res, 1, "");
});

app.get('/projects/filter', function(req, res) {
  project_filter(req, res, req.query.page || 1, req.query.q || "");
});

app.get('/projects/:id', function(req, res) {
	Hack.findOne({
		"hackid": req.params.id,
	}, function(err, doc) {
    if (doc === null) {
      res.redirect('/404');
      return;
    }
		var team = {};

		for (var i=0; i<doc.team.length; i++) {
			if(doc.team[i]) {
				team[doc.team[i]] = {
					name: doc.team[i],
					avatarUrl: "https://s3.amazonaws.com/hackerfair/default-photo.jpg"
				};
			}
		}

		User.where('github.username').in(doc.team).exec(function(err, docs) {
			for (var i=0; i<docs.length; i++) {
				team[docs[i].github.username] = {
					name: docs[i].info.name || docs[i].github.name || docs[i].github.username,
					avatarUrl: docs[i].github.avatarUrl,
				};
			}
			res.render('hack', {
				title: doc.title,
				user: req.user,
				hack: doc,
				team: team,
        names: doc.names
			});
		});
	});
});

app.get('/projects/:id/edit', ensureAuthenticated('/login'), function(req, res) {
  Hack.findOne({
    "hackid": req.params.id,
  }, function(err, doc) {
    if (doc.owners.indexOf(req.user._id) < 0) {
      res.redirect('/projects/'+req.params.id);
    }
    else {
      User.where('_id').in(doc.owners).exec(function(err, docs) {
        res.render('edit_hack', {
          title: doc.title,
          user: req.user,
          hack: doc,
          owners: docs.map(function(owner) {
            return owner.github.username;
          }),
        });
      });
    }
  });
});

app.post('/projects/:id', ensureAuthenticated('/login'), function(req, res) {
  Hack.findOne({
    "hackid": req.params.id,
  }, function(err, doc) {
    if (doc.owners.indexOf(req.user._id) < 0) {
      res.redirect('/projects/'+req.params.id);
    } else {
      doc.title = req.body.title;
      doc.source = forceAbsolute(req.body.source);
      doc.team = req.body.team.split(/[,\/ ]+/);
      User.where('github.username').in(req.body.owners.split(/[,\/ ]+/)).exec(function(e, users) {
        if (e || !users) {
          console.log("Error occured: "+e);
        } else {
          doc.owners = users.map(function (user) {
            return mongoose.Types.ObjectId(""+user._id);
          });
          doc.demo = forceAbsolute(req.body.demo);
          doc.video = forceAbsolute(req.body.video);
          doc.picture = forceAbsolute(req.body.picture);
          doc.blurb = req.body.blurb;
          doc.tags = req.body.tags.toLowerCase().split(',').map(stripSpaces);
          doc.comments = req.body.comments;
          doc.save(function(er, d) {
            if (er) {
              console.log(er);
            } else {
              res.redirect('/projects/'+doc.hackid);
            }
          });
        }
      });
    }
  });
});

app.get('/submit', ensureAuthenticated('/login'), function(req, res) {
  res.render('submit', {
    title: 'Submit Hack',
    user: req.user,
  });
});

app.get('/summary/:eventname', function(req, res) {
  if (false) {//['syadlowsky', 'viyer', 'vedantk', 'geraldgfong', 'nelsonz'].indexOf(req.user.github.username) < 0) {
    res.redirect('/hacks');
  } else {
    var query = Hack.find({event:req.params.eventname});
    query.exec(function(err, docs) {
      console.log("Creating summary of event: "+req.params.eventname);
      docs = shuffle(docs);
      var respString = "";
      for (var i = 0; i < docs.length; i++) {
        console.log("Making report for "+docs[i]);
        respString += docs[i].title+"\n";
        respString += Array(docs[i].title.length+1).join("-")+"\n";
        respString += "Description: "+docs[i].blurb+"\n";
        respString += "       Team: "+docs[i].team.join(", ")+"\n";
        respString += "\n";
      }
      console.log("Summary generation complete.");
      res.attachment(req.params.eventname+".txt");
      res.end(respString);
      console.log("Completed transfer");
    });
  }
});

app.post('/submit', ensureAuthenticated('/login'), function(req, res) {
  Hack.find({}, function(err, docs) {
    var address = stripPunct(req.body.title.toLowerCase()),
      collisions = 0;
      docs.map(function(doc) {
        collisions += (stripPunct(doc.title.toLowerCase()) == address ? 1 : 0);
      }).length;

    var now = new Date();
    Event.findOne({start: {$lt: now}, end: {$gt: now}}, function(err, event){

      var name = "on-going-hacks";
      if(!err && event){
        name = event.name;
      }


      var hack = new Hack({
        title: req.body.title,
        owners: [req.user._id],
        source: forceAbsolute(req.body.source),
        demo: forceAbsolute(req.body.demo),
        video: forceAbsolute(req.body.video),
        picture: forceAbsolute(req.body.picture),
        blurb: req.body.blurb,
        tags: req.body.tags.toLowerCase().split(',').map(stripSpaces),
        hackid: address+"-"+Math.random().toString(36).substring(2, 8)+(collisions ? collisions : ""),
        team: req.body.team.split(',').map(stripSpaces),
        booth: req.body.booth,
        event: name,
        comments: [req.body.comments]
      });

      hack.save(function(err, doc) {
        if (err) {
          console.log(err);
        }
        res.redirect('/projects/'+hack.hackid);
      });
    });
  });
});

app.get('/', function(req, res) {
  res.render('index', {
    title: 'Home',
    user: req.user,
  });
});

app.post('/projects/:id/comment', function(req,res) {

  var newComment = {poster: req.body.postername, comment: req.body.postercomment};

  Hack.update({
    "hackid": req.params.id,
  }, { $push: { comments: newComment } },
  function(err, doc, raw) {
    res.redirect('/projects/'+req.params.id);
  });
});

// 404!!!!111!
app.get('*', function(req, res) {
  res.status(404);
  res.render('404', {
    title : ':( 404'
  });
});
/* END REQUEST HANDLERS */

// listen for requests on the specified port
app.listen(process.env.PORT || port);
