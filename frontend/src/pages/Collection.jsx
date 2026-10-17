import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ShopContext } from "../context/shopContext";
import { Search, SlidersHorizontal, X } from "lucide-react";
import {
  productGenders,
  productPrograms,
} from "../../../shared/productTaxonomy";
import ProductItem from "../components/ProductItem";
import SearchBar from "../components/SearchBar";
import CollectionFilters from "../components/CollectionFilters";
import CollectionFilterDrawer from "../components/CollectionFilterDrawer";
import "../components/StorefrontFoundation.css";
import "./Collection.css";

const PAGE_SIZE = 24;

const Collection = () => {
  const {
    products,
    search,
    setSearch,
    showSearch,
    setShowSearch,
    productsLoading = false,
    productError = "",
    getProductsData,
  } = useContext(ShopContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const resultsRef = useRef(null);
  // Import a legacy navbar search once, then the URL owns Collection search/history.
  const initialSearch = useRef(showSearch ? search : "");
  const inheritsSearch = !searchParams.has("q") && showSearch && Boolean(search);
  const query = searchParams.get("q") || "";
  // Page changes should not invalidate the full-catalog filter/sort memo.
  const genderValues = JSON.stringify(searchParams.getAll("gender"));
  const programValues = JSON.stringify(searchParams.getAll("program"));
  const genders = useMemo(
    () => [
      ...new Set(
        JSON.parse(genderValues).filter((value) => productGenders.includes(value)),
      ),
    ],
    [genderValues],
  );
  const programs = useMemo(
    () => [
      ...new Set(
        JSON.parse(programValues).filter((value) => productPrograms.includes(value)),
      ),
    ],
    [programValues],
  );
  const featuredOnly = searchParams.get("featured") === "true";
  const requestedSort = searchParams.get("sort");
  const sortType = ["low-high", "high-low"].includes(requestedSort)
    ? requestedSort
    : "relevant";
  const closeFilters = useCallback(() => setFilterOpen(false), []);

  useEffect(() => {
    const inherited = initialSearch.current;
    initialSearch.current = "";
    if (!searchParams.has("q") && inherited) {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("q", inherited);
          next.delete("page");
          return next;
        },
        { replace: true },
      );
      return;
    }
    const currentQuery = searchParams.get("q") || "";
    if (search !== currentQuery) setSearch(currentQuery);
    if (showSearch !== Boolean(currentQuery))
      setShowSearch(Boolean(currentQuery));
  }, [
    searchParams,
    search,
    showSearch,
    setSearch,
    setShowSearch,
    setSearchParams,
  ]);

  const toggleFilter = (key, value) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      const current = next.getAll(key);
      const selected = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      next.delete(key);
      selected.forEach((item) => next.append(key, item));
      next.delete("page");
      return next;
    });
  const clearFilters = () =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const key of ["gender", "program", "featured"]) next.delete(key);
      next.delete("page");
      return next;
    });
  const changeSearch = (value) => {
    setSearch(value);
    setShowSearch(Boolean(value));
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("q", value);
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };
  const clearCriteria = () => {
    setSearch("");
    setShowSearch(false);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const key of ["gender", "program", "featured", "q"])
        next.delete(key);
      next.delete("page");
      return next;
    });
  };
  const changeSort = (value) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === "relevant") next.delete("sort");
      else next.set("sort", value);
      next.delete("page");
      return next;
    });
  const removeFeatured = () =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("featured");
      next.delete("page");
      return next;
    });

  const filteredProducts = useMemo(() => {
    let result = products.slice();
    if (featuredOnly) result = result.filter((item) => item.BestSeller);
    const term = query.trim().toLowerCase();
    if (term)
      result = result.filter((item) => item.name.toLowerCase().includes(term));
    if (genders.length)
      result = result.filter((item) => genders.includes(item.category));
    if (programs.length)
      result = result.filter((item) => programs.includes(item.subCategory));
    if (sortType === "low-high") result.sort((a, b) => a.price - b.price);
    else if (sortType === "high-low") result.sort((a, b) => b.price - a.price);
    return result;
  }, [products, featuredOnly, query, genders, programs, sortType]);

  const rawPage = searchParams.get("page");
  const pageNumber = Number(rawPage);
  const requestedPage =
    /^\d+$/.test(rawPage || "") &&
    Number.isSafeInteger(pageNumber) && pageNumber > 0
      ? pageNumber
      : 1;
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageProducts = filteredProducts.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    // Do not discard a saved page while the authoritative catalog is unavailable.
    if (
      productsLoading || productError || inheritsSearch || !searchParams.has("page")
    )
      return;
    const canonicalPage = currentPage === 1 ? null : String(currentPage);
    if (searchParams.getAll("page").length === 1 && rawPage === canonicalPage)
      return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (canonicalPage === null) next.delete("page");
        else next.set("page", canonicalPage);
        return next;
      },
      { replace: true },
    );
  }, [
    productsLoading, productError, inheritsSearch, searchParams,
    rawPage, currentPage, setSearchParams,
  ]);

  const changePage = (page) => {
    if (page < 1 || page > pageCount || page === currentPage) return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (page === 1) next.delete("page");
      else next.set("page", String(page));
      return next;
    });
  };

  const selections = [
    ...genders.map((value) => ["gender", value]),
    ...programs.map((value) => ["program", value]),
  ];
  const filterCount = selections.length + Number(featuredOnly);
  const hasCriteria = filterCount > 0 || Boolean(query);
  const cueImage = products.find((item) => item.image?.[0])?.image[0];

  return (
    <section className="collection-page" aria-labelledby="collection-heading">
      <div className="collection-container">
        <header className="collection-header">
          <div className="collection-intro">
            <nav className="collection-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Collection</span>
            </nav>
            <div className="collection-heading-accent">
              <p className="collection-eyebrow">
                <span className="collection-copy-desktop">
                  Shop / campus essentials
                </span>
                <span className="collection-copy-tablet">
                  Find your campus essentials
                </span>
              </p>
              <h1 id="collection-heading">
                THE <span className="collection-title-accent">COLLECTION</span>
              </h1>
            </div>
            <p className="collection-description">
              <span className="collection-copy-desktop">
                Browse your program and gender, or search for the exact item you
                need.
              </span>
              <span className="collection-copy-tablet">
                Browse the right merchandise for your program and gender.
              </span>
              <span className="collection-copy-mobile">
                Find the essentials that fit your campus life.
              </span>
            </p>
          </div>
          <aside
            className="collection-merchandise-info"
            aria-label="Campus merchandise information"
          >
            <div>
              <p className="collection-info-eyebrow">For every campus day</p>
              <h2>
                <span className="collection-copy-desktop">
                  Find your essentials.
                </span>
                <span className="collection-copy-tablet">
                  Campus essentials. Easier to find.
                </span>
              </h2>
              <p>
                <span className="collection-copy-desktop">
                  Choose a program and explore the available items.
                </span>
                <span className="collection-copy-tablet">
                  Choose a program, compare products and review sizes on the
                  product page.
                </span>
              </p>
            </div>
            {cueImage && <img src={cueImage} alt="" loading="lazy" />}
          </aside>
        </header>
        <div className="collection-layout">
          <aside
            className="collection-filter-sidebar"
            aria-label="Product filters"
          >
            <div className="collection-filter-heading">
              <h2>Filters</h2>
              <button type="button" onClick={clearFilters}>
                Clear all
              </button>
            </div>
            <CollectionFilters
              genders={genders}
              programs={programs}
              onToggle={toggleFilter}
            />
            <div className="collection-filter-help">
              <h3>Need something specific?</h3>
              <p>Try searching the collection above.</p>
            </div>
          </aside>
          <div className="collection-results" aria-busy={productsLoading}>
            <div className="collection-tools">
              <SearchBar value={query} onChange={changeSearch} />
              <button
                type="button"
                className="collection-filter-trigger collection-outline-action"
                onClick={() => setFilterOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={filterOpen}
                aria-controls="collection-filter-drawer"
              >
                <SlidersHorizontal
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />{" "}
                Filters{filterCount ? " (" + filterCount + ")" : ""}
              </button>
              <label className="collection-sort">
                <span>Sort by</span>
                <select
                  aria-label="Sort products"
                  value={sortType}
                  onChange={(event) => changeSort(event.target.value)}
                >
                  <option value="relevant">Relevant</option>
                  <option value="low-high">Price: Low to High</option>
                  <option value="high-low">Price: High to Low</option>
                </select>
              </label>
              <p
                ref={resultsRef}
                tabIndex={-1}
                id="collection-results"
                className="collection-results-count"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {productsLoading && !products.length ? (
                  <span>Loading essentials…</span>
                ) : (
                  <span>
                    <strong>{filteredProducts.length}</strong>{" "}
                    {filteredProducts.length === 1 ? "essential" : "essentials"}{" "}
                    found
                  </span>
                )}
                <small className="collection-result-note">
                  Gender and program filters
                </small>
              </p>
            </div>
            <div
              className={
                "collection-active-filters" +
                (hasCriteria ? " has-filters" : "")
              }
            >
              {hasCriteria ? (
                <>
                  <p>Filters applied</p>
                  {selections.map(([key, value]) => (
                    <button
                      key={key + value}
                      type="button"
                      className="collection-filter-chip"
                      onClick={() => toggleFilter(key, value)}
                      aria-label={"Remove " + value + " filter"}
                    >
                      {value}{" "}
                      <X size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  ))}
                  {featuredOnly && (
                    <button
                      type="button"
                      className="collection-filter-chip"
                      onClick={removeFeatured}
                      aria-label="Remove featured filter"
                    >
                      Featured{" "}
                      <X size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                  {query && (
                    <button
                      type="button"
                      className="collection-filter-chip"
                      onClick={() => changeSearch("")}
                      aria-label="Remove search filter"
                    >
                      Search: {query}{" "}
                      <X size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="collection-clear-action"
                    onClick={clearCriteria}
                  >
                    Clear all
                  </button>
                </>
              ) : (
                <>
                  <p>All merchandise</p>
                  <span>Browse available catalog products</span>
                </>
              )}
            </div>
            {productError && (
              <div className="collection-message">
                <h2>
                  Unable to {products.length ? "refresh" : "load"} collection
                </h2>
                <p>{productError}</p>
                <button
                  type="button"
                  className="collection-brand-action"
                  onClick={() => getProductsData()}
                >
                  Try again
                </button>
              </div>
            )}
            {productsLoading && !products.length ? (
              <div className="collection-message">
                <p>Loading your campus essentials…</p>
              </div>
            ) : (
              <>
                <div
                  id="collection-product-grid"
                  className="collection-product-grid"
                >
                  {pageProducts.map((item) => (
                    <ProductItem
                      key={item._id}
                      id={item._id}
                      name={item.name}
                      image={item.image}
                      price={item.price}
                      category={item.category}
                      subCategory={item.subCategory}
                      collection
                    />
                  ))}
                </div>
                {filteredProducts.length > 0 && (
                  <nav
                    className="collection-pagination"
                    aria-label="Collection pagination"
                  >
                    <p
                      className="collection-page-range"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {`Showing ${pageStart + 1}–${pageStart + pageProducts.length} of ${filteredProducts.length} ${filteredProducts.length === 1 ? "essential" : "essentials"}`}
                    </p>
                    {pageCount > 1 && (
                      <div className="collection-page-controls">
                        <button
                          type="button"
                          className="collection-outline-action"
                          aria-label="Previous product page"
                          aria-controls="collection-product-grid"
                          aria-disabled={currentPage === 1}
                          onClick={() => changePage(currentPage - 1)}
                        >
                          Previous
                        </button>
                        <span aria-current="page">
                          Page {currentPage} of {pageCount}
                        </span>
                        <button
                          type="button"
                          className="collection-outline-action"
                          aria-label="Next product page"
                          aria-controls="collection-product-grid"
                          aria-disabled={currentPage === pageCount}
                          onClick={() => changePage(currentPage + 1)}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </nav>
                )}
                {!filteredProducts.length && !productError && (
                  <div className="collection-message">
                    <Search
                      className="collection-message-icon"
                      size={24}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <h2>
                      {products.length
                        ? "No matching essentials"
                        : "No essentials available"}
                    </h2>
                    <p>
                      {products.length
                        ? "Try a different search or reset your gender and program filters."
                        : "Check back for available campus merchandise."}
                    </p>
                    {hasCriteria && (
                      <button
                        type="button"
                        className="collection-brand-action"
                        onClick={clearCriteria}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {filterOpen && (
        <CollectionFilterDrawer
          genders={genders}
          programs={programs}
          onToggle={toggleFilter}
          onReset={clearFilters}
          count={filteredProducts.length}
          onClose={closeFilters}
          fallbackFocusRef={resultsRef}
        />
      )}
    </section>
  );
};

export default Collection;
