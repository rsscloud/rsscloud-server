(function() {
  var template = Handlebars.template, templates = Handlebars.templates = Handlebars.templates || {};
templates['eventlog'] = template({"1":function(container,depth0,helpers,partials,data) {
    var helper;

  return " <i class=\"fa fa-info-circle btn btn-default btn-xs\" data-toggle=\"modal\" data-target=\"#headers"
    + container.escapeExpression(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"id","hash":{},"data":data}) : helper)))
    + "\"></i>";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "<tr>\n    <td>"
    + alias4(((helper = (helper = helpers.eventtype || (depth0 != null ? depth0.eventtype : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"eventtype","hash":{},"data":data}) : helper)))
    + "</td>\n    <td>"
    + ((stack1 = ((helper = (helper = helpers.htmltext || (depth0 != null ? depth0.htmltext : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"htmltext","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.headers : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "</td>\n    <td class=\"date\">"
    + alias4(((helper = (helper = helpers.time || (depth0 != null ? depth0.time : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"time","hash":{},"data":data}) : helper)))
    + "</td>\n    <td>"
    + alias4(((helper = (helper = helpers.secs || (depth0 != null ? depth0.secs : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"secs","hash":{},"data":data}) : helper)))
    + "</td>\n</tr>\n";
},"useData":true});
})();