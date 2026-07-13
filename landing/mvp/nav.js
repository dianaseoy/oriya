/* SubNavigation — the one shared chrome component across MVP screens.
 * Plain React.createElement (no JSX) so it loads as a normal script and
 * every text/babel page can use it without a second Babel pass. */

function SubNavigation(props) {
  var e = React.createElement;
  var TABS = [
    { id: "board",      label: "Board",      href: "index.html" },
    { id: "passport",   label: "Passport",   href: "passport.html" },
    { id: "challenges", label: "Challenges", href: "challenges.html" },
    { id: "squads",     label: "Squads",     href: "squads.html" },
  ];
  return e("nav", { className: "subnav", "aria-label": "Sections" }, TABS.map(function (t) {
    var on = props.active === t.id;
    return e("a", {
      key: t.id,
      href: t.href,
      className: "tab" + (on ? " active" : ""),
      "aria-current": on ? "page" : undefined,
    }, t.label);
  }));
}
