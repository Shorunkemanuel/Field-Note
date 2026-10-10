import { Link } from "react-router-dom";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" to="/">
        <span className="brand-mark" aria-hidden="true">F</span>
        <span>Field-Note</span>
      </Link>
      <span className="header-caption">Field evidence, clearly recorded</span>
    </header>
  );
}
