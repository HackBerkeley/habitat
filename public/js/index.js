/* transition a grid */
function easeGrid(id, direction, maxtime) {
	$(".grid#"+id).children().each(function(i, e) {
		$(e).animate({
			opacity: ((direction == "out") ? 0.0 : 1.0)
		}, Math.random()*maxtime);
	});
};

/* transition between pages */
function transition(dest) {
	var pagefade_delay = 0;
	
	$(".grid").each(function(i, e) {
		easeGrid($(this).attr('id'), "out", gridfade_t);
		pagefade_delay = gridfade_t / 2;
	});
	setTimeout(function() {
		$("body").fadeOut(pagefade_t, function() {
			window.location.href = dest;
		});
	}, pagefade_delay);
}

var gridfade_t = 500,
	pagefade_t = 100;

var keypress = 0;     

$(function() {
	$("body").fadeIn(pagefade_t, function() {
		$(".grid").each(function(i, e) {
			easeGrid($(this).attr('id'), "in", gridfade_t);
		});
	});
	
	$(".link").click(function() {
    var jThis = $(this);
		transition((
      (jThis.hasClass('external') > -1) ? '' : '/') 
        + 
      jThis.attr('name') 
        + 
      ( jThis.attr('name')=="login" ? "?loc=" + window.location : ""));
	});

  $("a").click(function() {
    transition($(this).attr("href"));
  });
	
	$(".form_input").focus(function() {
    var jThis = $(this);
		if (!jThis.attr('value')) {
			jThis.attr('value', jThis.attr('data-default'));
		}
	});
  var jNameField = $('#nameField'),
      jNameSaveButton = $('#nameSaveButton'),
      jNameEditIcon = $('#nameEditIcon'),
      jBlurb = $('#blurb'),
      jBlurbEditIcon = $('#blurbEditIcon'),
      jSaveButton = $('#saveButton');
  jNameField.keypress(function () {
    jNameSaveButton.show();
    jNameEditIcon.hide();
  });
  jNameSaveButton.bind("click", function () {
    $.post("/users/me", {user: {name: jNameField.text()}});
    jNameSaveButton.hide();
    jNameEditIcon.show();
  });
  jBlurb.keypress(function () {
    keypress++;
    jSaveButton.show();
    jBlurbEditIcon.hide();
  });
  jSaveButton.bind("click", function () {
    $.post("/users/me", {user: {blurb: jBlurb.text()}});
    jSaveButton.hide();
    jBlurbEditIcon.show();
    keypress = 0;
  });
  jBlurb.focus(function() {
    jSaveButton.show();
    jBlurbEditIcon.hide();
  }).focusout(function() {
    if (keypress == 0 && (!jBlurb.is(":focus"))) {
      jSaveButton.hide();
      jBlurbEditIcon.show();
    }
  });
});
