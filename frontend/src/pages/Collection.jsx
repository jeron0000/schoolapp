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
  getAcademicProgramName,
  getCollectionProgramOptions,
  getGenderOptions,
  getMerchandiseCategoryOptions,
  getProductAcademicPrograms,
  getProductCategoryName,
  getProductGenderName,
  getProductGenders,
  getProductMerchandiseCategoryCodes,
} from "../../../shared/productTaxonomy";
import ProductItem from "../components/ProductItem";
import { groupProductListings } from '../../../shared/productVariants.js';
import SearchBar from "../components/SearchBar";
import CollectionFilters from "../components/CollectionFilters";
import CollectionFilterDrawer from "../components/CollectionFilterDrawer";
import "../components/StorefrontFoundation.css";
import "./Collection.css";

const PAGE_SIZE = 24;

const actionClassName = [
  'inline-flex min-h-12 min-w-0 items-center justify-center gap-3 rounded-[7px] border',
  'px-4 py-2.5 text-center text-[13px] font-semibold leading-[1.5]'
].join(' ');
const outlineActionClassName = [
  actionClassName,
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'text-[color:var(--pamo-color-text-primary)]',
  'hover:border-[color:var(--pamo-color-border-input)] hover:bg-[var(--pamo-color-surface-subtle)]'
].join(' ');
const brandActionClassName = [
  actionClassName,
  'border-transparent bg-[var(--pamo-color-brand-yellow)] text-slate-950',
  'hover:bg-[var(--pamo-color-brand-hover)] active:bg-[var(--pamo-color-brand-pressed)]'
].join(' ');
const merchandiseInfoClassName = [
  'relative hidden min-w-0 border border-[color:var(--pamo-color-border-default)]',
  'bg-[var(--pamo-color-surface-default)]',
  "before:absolute before:left-4 before:w-1 before:rounded-sm before:bg-[var(--pamo-color-brand-yellow)] before:content-['']",
  'md:mt-9 md:flex md:min-h-[118px] md:items-center md:rounded-[9px] md:pb-6 md:pl-9 md:pr-6 md:pt-[26px]',
  'md:before:bottom-6 md:before:top-6',
  'min-[1180px]:m-0 min-[1180px]:min-h-[150px] min-[1180px]:items-start min-[1180px]:justify-between min-[1180px]:gap-6',
  'min-[1180px]:pb-5 min-[1180px]:pl-[35px] min-[1180px]:pr-6 min-[1180px]:pt-6',
  'min-[1180px]:before:bottom-5 min-[1180px]:before:top-5'
].join(' ');
const collectionMessageClassName = [
  'mt-6 flex min-h-[340px] min-w-0 flex-col items-center justify-center gap-5',
  'rounded-[9px] border border-[color:var(--pamo-color-border-default)]',
  'bg-[var(--pamo-color-surface-default)] px-5 py-10 text-center',
  '[&_h2]:text-[23px] [&_h2]:font-semibold [&_h2]:leading-[1.48]',
  '[&_p]:max-w-[470px] [&_p]:text-sm [&_p]:leading-[1.6]',
  '[&_p]:text-[color:var(--pamo-color-text-secondary)]'
].join(' ');
const filterChipClassName = [
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-between gap-3 rounded-md',
  'bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-left text-[13px]',
  'font-medium leading-[1.5] text-[color:var(--pamo-color-text-primary)]',
  'hover:text-[color:var(--pamo-color-accent-text)]'
].join(' ');

const getActiveFiltersClassName = hasCriteria => {
  const classNames = [
    'min-[1180px]:mt-[18px] min-[1180px]:flex min-[1180px]:min-h-9',
    'min-[1180px]:flex-wrap min-[1180px]:items-center min-[1180px]:gap-3'
  ];

  if (hasCriteria) {
    classNames.push('mt-6 flex flex-wrap items-center gap-x-3 gap-y-2');
  } else {
    classNames.push('hidden');
  }

  return classNames.join(' ');
};

const getProductGridClassName = hasCriteria => {
  const classNames = [
    'grid grid-cols-2 gap-x-3 gap-y-5',
    'max-[359px]:grid-cols-1',
    'md:grid-cols-3 md:gap-x-5 md:gap-y-10',
    'min-[1180px]:mt-4 min-[1180px]:grid-cols-4 min-[1180px]:gap-x-[21px] min-[1180px]:gap-y-[26px]'
  ];

  classNames.push(hasCriteria ? 'mt-6 md:mt-6' : 'mt-[42px] md:mt-10');
  return classNames.join(' ');
};

const Collection = () => {
  const {
    products,
    search,
    setSearch,
    showSearch,
    setShowSearch,
    productsLoading = false,
    productError = "",
    productCategories = [],
    categoriesLoading = false,
    categoryError = "",
    getProductCategories,
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
  const merchandiseValues = JSON.stringify(searchParams.getAll("merchandise"));
  const programOptions = useMemo(
    () => getCollectionProgramOptions(productCategories),
    [productCategories],
  );
  const genderOptions = useMemo(
    () => getGenderOptions(productCategories),
    [productCategories],
  );
  const merchandiseOptions = useMemo(
    () => getMerchandiseCategoryOptions(productCategories),
    [productCategories],
  );
  const programOptionValues = useMemo(
    () => new Set(programOptions.map(option => option.value)),
    [programOptions],
  );
  const merchandiseOptionValues = useMemo(
    () => new Set(merchandiseOptions.map(option => option.value)),
    [merchandiseOptions],
  );
  const genderOptionValues = useMemo(
    () => new Set(genderOptions.map(option => option.value)),
    [genderOptions],
  );
  const genders = useMemo(
    () => [
      ...new Set(
        JSON.parse(genderValues).filter((value) => genderOptionValues.has(value)),
      ),
    ],
    [genderValues, genderOptionValues],
  );
  const programs = useMemo(
    () => [
      ...new Set(
        JSON.parse(programValues).filter((value) => programOptionValues.has(value)),
      ),
    ],
    [programValues, programOptionValues],
  );
  const merchandiseCategories = useMemo(
    () => [
      ...new Set(
        JSON.parse(merchandiseValues).filter(value => merchandiseOptionValues.has(value)),
      ),
    ],
    [merchandiseValues, merchandiseOptionValues],
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
    if (search !== currentQuery) {
      setSearch(currentQuery);
    }
    if (showSearch !== Boolean(currentQuery)) {
      setShowSearch(Boolean(currentQuery));
    }
  }, [
    searchParams,
    search,
    showSearch,
    setSearch,
    setShowSearch,
    setSearchParams,
  ]);

  const toggleFilter = (key, value) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      const current = next.getAll(key);
      let selected = [...current, value];
      if (current.includes(value)) {
        selected = current.filter((item) => item !== value);
      }
      next.delete(key);
      selected.forEach((item) => next.append(key, item));
      next.delete("page");
      return next;
    });
  };
  const clearFilters = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const key of ["gender", "program", "merchandise", "featured"]) {
        next.delete(key);
      }
      next.delete("page");
      return next;
    });
  };
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
      for (const key of ["gender", "program", "merchandise", "featured", "q"]) {
        next.delete(key);
      }
      next.delete("page");
      return next;
    });
  };
  const changeSort = (value) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === "relevant") {
        next.delete("sort");
      } else {
        next.set("sort", value);
      }
      next.delete("page");
      return next;
    });
  };
  const removeFeatured = () => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("featured");
      next.delete("page");
      return next;
    });
  };

  const filteredProducts = useMemo(() => {
    const seenProducts = new Set();
    let result = products.filter((item) => {
      const identity = item._id || item;
      if (seenProducts.has(identity)) return false;
      seenProducts.add(identity);
      return true;
    });
    if (featuredOnly) {
      result = result.filter((item) => item.BestSeller);
    }
    const term = query.trim().toLowerCase();
    if (term) {
      result = result.filter((item) => {
        const anchor = products.find(product => product._id === item.variantGroupId);
        return [item.name, item.optionLabel, item.colorLabel, anchor?.groupTitle].filter(Boolean).join(' ').toLowerCase().includes(term);
      });
    }
    if (genders.length) {
      result = result.filter((item) => {
        const assignedGenders = getProductGenders(item);
        return genders.some(value => assignedGenders.includes(value));
      });
    }
    if (programs.length) {
      result = result.filter((item) => {
        const assignedPrograms = getProductAcademicPrograms(item);
        return programs.some(value => assignedPrograms.includes(value));
      });
    }
    if (merchandiseCategories.length) {
      result = result.filter((item) => {
        const assignedCategories = getProductMerchandiseCategoryCodes(item);
        return merchandiseCategories.some(value => assignedCategories.includes(value));
      });
    }
    result = groupProductListings(result, products);
    if (sortType === "low-high") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortType === "high-low") {
      result.sort((a, b) => b.price - a.price);
    }
    return result;
  }, [
    products,
    featuredOnly,
    query,
    genders,
    programs,
    merchandiseCategories,
    sortType,
  ]);

  const rawPage = searchParams.get("page");
  const pageNumber = Number(rawPage);
  const hasValidPage = /^\d+$/.test(rawPage || "")
    && Number.isSafeInteger(pageNumber)
    && pageNumber > 0;
  const requestedPage = hasValidPage ? pageNumber : 1;
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageProducts = filteredProducts.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    // Do not discard a saved page while the authoritative catalog is unavailable.
    if (
      productsLoading || productError || inheritsSearch || !searchParams.has("page")
    ) {
      return;
    }
    const canonicalPage = currentPage === 1 ? null : String(currentPage);
    if (searchParams.getAll("page").length === 1 && rawPage === canonicalPage) {
      return;
    }
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (canonicalPage === null) {
          next.delete("page");
        } else {
          next.set("page", canonicalPage);
        }
        return next;
      },
      { replace: true },
    );
  }, [
    productsLoading, productError, inheritsSearch, searchParams,
    rawPage, currentPage, setSearchParams,
  ]);

  const changePage = (page) => {
    if (page < 1 || page > pageCount || page === currentPage) {
      return;
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (page === 1) {
        next.delete("page");
      } else {
        next.set("page", String(page));
      }
      return next;
    });
  };

  const filterOptionLabels = new Map([
    ...genderOptions,
    ...programOptions,
    ...merchandiseOptions,
  ].map(option => [option.value, option.label]));
  const selections = [
    ...genders.map((value) => ["gender", value, filterOptionLabels.get(value) || value]),
    ...programs.map((value) => ["program", value, filterOptionLabels.get(value) || value]),
    ...merchandiseCategories.map((value) => [
      "merchandise",
      value,
      filterOptionLabels.get(value) || value,
    ]),
  ];
  const filterCount = selections.length + Number(featuredOnly);
  const hasCriteria = filterCount > 0 || Boolean(query);
  const cueImage = products.find((item) => item.image?.[0])?.image[0];
  const isInitialLoad = productsLoading && !products.length;
  const resultLabel = filteredProducts.length === 1 ? "essential" : "essentials";
  const filterButtonLabel = filterCount ? `Filters (${filterCount})` : "Filters";
  const errorAction = products.length ? "refresh" : "load";
  const emptyHeading = products.length ? "No matching essentials" : "No essentials available";
  const emptyMessage = products.length
    ? "Try a different search or reset your product filters."
    : "Check back for available campus merchandise.";

  return (
    <section className="collection-page text-[color:var(--pamo-color-text-primary)]" aria-labelledby="collection-heading">
      <div className="mx-auto w-[calc(100%-38px)] max-w-[var(--pamo-layout-max)] md:w-[calc(100%-60px)] min-[1180px]:w-[calc(100%-var(--pamo-home-gutter))]">
        <header className="pt-[30px] md:pt-10 min-[1180px]:grid min-[1180px]:min-h-[154px] min-[1180px]:grid-cols-[minmax(0,1.48fr)_minmax(0,1fr)] min-[1180px]:items-center min-[1180px]:gap-[72px] min-[1180px]:pt-1">
          <div>
            <nav className="flex flex-wrap items-center gap-2 text-[11px] uppercase leading-[1.45] text-[color:var(--pamo-color-text-secondary)] md:hidden" aria-label="Breadcrumb">
              <Link to="/" className="inline-flex min-h-6 items-center">Home</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Collection</span>
            </nav>
            <div className="border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4 min-[1180px]:pl-5">
              <p className="hidden text-[11px] font-medium uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)] md:block">
                <span className="hidden min-[1180px]:inline">
                  Shop / campus essentials
                </span>
                <span className="hidden md:inline min-[1180px]:hidden">
                  Find your campus essentials
                </span>
              </p>
              <h1 id="collection-heading" className="mt-[22px] text-[clamp(25px,7.44vw,29px)] font-semibold leading-[1.3] tracking-[-0.015em] md:text-[35px] md:leading-[1.23] min-[1180px]:text-[38px] min-[1180px]:leading-[1.21]">
                THE <span className="min-[1180px]:text-[color:var(--pamo-color-accent-text)]">COLLECTION</span>
              </h1>
            </div>
            <p className="ml-5 mt-3.5 max-w-[65ch] text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)] md:mt-5 md:text-[15px] md:leading-[1.44] min-[1180px]:ml-6 min-[1180px]:mt-3.5">
              <span className="hidden min-[1180px]:inline">
                Browse your program and gender, or search for the exact item you
                need.
              </span>
              <span className="hidden md:inline min-[1180px]:hidden">
                Browse the right merchandise for your program and gender.
              </span>
              <span className="inline md:hidden">
                Find the essentials that fit your campus life.
              </span>
            </p>
          </div>
          <aside
            className={merchandiseInfoClassName}
            aria-label="Campus merchandise information"
          >
            <div>
              <p className="mb-3 hidden text-[11px] font-medium uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)] min-[1180px]:block">For every campus day</p>
              <h2 className="text-[19px] font-semibold leading-[1.44] min-[1180px]:text-[22px]">
                <span className="hidden min-[1180px]:inline">
                  Find your essentials.
                </span>
                <span className="hidden md:inline min-[1180px]:hidden">
                  Campus essentials. Easier to find.
                </span>
              </h2>
              <p className="mt-2.5 text-[13px] leading-[1.5] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:mt-3">
                <span className="hidden min-[1180px]:inline">
                  Choose a program and explore the available items.
                </span>
                <span className="hidden md:inline min-[1180px]:hidden">
                  Choose a program, compare products and review sizes on the
                  product page.
                </span>
              </p>
            </div>
            {cueImage && <img src={cueImage} alt="" loading="lazy" className="hidden h-[88px] w-[88px] shrink-0 object-contain min-[1180px]:block" />}
          </aside>
        </header>
        <div className="mt-12 md:mt-[26px] min-[1180px]:mt-[27px] min-[1180px]:grid min-[1180px]:grid-cols-[252px_minmax(0,1fr)] min-[1180px]:items-start min-[1180px]:gap-[31px] min-[1180px]:border-t min-[1180px]:border-[color:var(--pamo-color-border-default)] min-[1180px]:pt-10">
          <aside
            className="hidden min-w-0 min-[1180px]:mt-1 min-[1180px]:block min-[1180px]:rounded-[10px] min-[1180px]:border min-[1180px]:border-[color:var(--pamo-color-border-default)] min-[1180px]:bg-[var(--pamo-color-surface-default)] min-[1180px]:px-[18px] min-[1180px]:pb-5 min-[1180px]:pt-3"
            aria-label="Product filters"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--pamo-color-border-default)] pb-2">
              <h2 className="text-[15px] font-semibold leading-[1.5]">Filters</h2>
              <button type="button" onClick={clearFilters} className="min-h-11 min-w-11 text-[13px] font-medium text-[color:var(--pamo-color-text-secondary)] hover:text-[color:var(--pamo-color-accent-text)]">
                Clear all
              </button>
            </div>
            <CollectionFilters
              genders={genders}
              programs={programs}
              merchandiseCategories={merchandiseCategories}
              genderOptions={genderOptions}
              programOptions={programOptions}
              merchandiseOptions={merchandiseOptions}
              categoriesLoading={categoriesLoading}
              categoryError={categoryError}
              onRetryCategories={getProductCategories}
              onToggle={toggleFilter}
            />
            <div className="mt-4 border-t border-[color:var(--pamo-color-border-default)] pt-5">
              <h3 className="text-[13px] font-semibold leading-[1.5]">Need something specific?</h3>
              <p className="mt-2 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">Try searching the collection above.</p>
            </div>
          </aside>
          <div className="min-w-0" aria-busy={productsLoading}>
            <div className="grid grid-cols-2 items-center gap-x-3 gap-y-[18px] max-[359px]:gap-3 md:grid-cols-[minmax(112px,0.77fr)_minmax(0,1.51fr)_minmax(150px,1fr)] md:gap-4 min-[1180px]:grid-cols-[minmax(130px,1fr)_minmax(0,35.44%)_minmax(0,32.33%)] min-[1180px]:gap-5">
              <SearchBar value={query} onChange={changeSearch} />
              <button
                type="button"
                className={outlineActionClassName + ' max-[359px]:px-2 md:col-start-1 md:row-start-1 min-[1180px]:hidden'}
                onClick={() => setFilterOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={filterOpen}
                aria-controls="collection-filter-drawer"
              >
                <SlidersHorizontal
                  className="shrink-0"
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />{" "}
                {filterButtonLabel}
              </button>
              <label className="flex min-w-0 items-center gap-4 md:col-start-3 md:row-start-1">
                <span className="hidden shrink-0 text-xs font-medium text-[color:var(--pamo-color-text-secondary)] min-[1180px]:block">Sort by</span>
                <select
                  aria-label="Sort products"
                  value={sortType}
                  onChange={(event) => changeSort(event.target.value)}
                  className="min-h-12 min-w-0 w-full rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3 py-2.5 text-[13px] font-medium leading-[1.5] text-[color:var(--pamo-color-text-primary)] max-[359px]:px-1.5 max-[359px]:text-xs"
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
                className="col-span-full mt-[18px] flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-sm font-semibold leading-[1.5] md:mt-4 md:text-[15px] min-[1180px]:col-start-1 min-[1180px]:row-start-1 min-[1180px]:m-0 min-[1180px]:text-sm min-[1180px]:font-normal min-[1180px]:!leading-[1.5]"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {isInitialLoad ? (
                  <span>Loading essentials…</span>
                ) : (
                  <span>
                    <strong className="font-semibold min-[1180px]:mr-2 min-[1180px]:text-[22px]">{filteredProducts.length}</strong>{" "}
                    {resultLabel} found
                  </span>
                )}
                <small className="text-xs font-normal leading-[inherit] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:hidden">
                  Gender, program, and merchandise filters
                </small>
              </p>
            </div>
            <div
              className={getActiveFiltersClassName(hasCriteria)}
            >
              {hasCriteria ? (
                <>
                  <p className="text-[13px] font-semibold leading-[1.5] min-[1180px]:text-sm">Filters applied</p>
                  {selections.map(([key, value, label]) => (
                    <button
                      key={key + value}
                      type="button"
                      className={filterChipClassName}
                      onClick={() => toggleFilter(key, value)}
                      aria-label={"Remove " + label + " filter"}
                    >
                      {label}{" "}
                      <X size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  ))}
                  {featuredOnly && (
                    <button
                      type="button"
                      className={filterChipClassName}
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
                      className={filterChipClassName}
                      onClick={() => changeSearch("")}
                      aria-label="Remove search filter"
                    >
                      Search: {query}{" "}
                      <X size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="min-h-11 min-w-11 px-3 py-2 text-[13px] leading-[1.5] text-[color:var(--pamo-color-text-secondary)] underline underline-offset-[3px]"
                    onClick={clearCriteria}
                  >
                    Clear all
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-semibold leading-[1.5] min-[1180px]:text-sm">All merchandise</p>
                  <span className="text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]">Browse available catalog products</span>
                </>
              )}
            </div>
            {productError && (
              <div className={collectionMessageClassName}>
                <h2 className="text-[23px] font-semibold leading-[1.48]">
                  Unable to {errorAction} collection
                </h2>
                <p className="max-w-[470px] text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">{productError}</p>
                <button
                  type="button"
                  className={brandActionClassName}
                  onClick={() => getProductsData()}
                >
                  Try again
                </button>
              </div>
            )}
            {isInitialLoad ? (
              <div className={collectionMessageClassName}>
                <p>Loading your campus essentials…</p>
              </div>
            ) : (
              <>
                <div
                  id="collection-product-grid"
                  className={getProductGridClassName(hasCriteria)}
                >
                  {pageProducts.map((item) => {
                    const assignedPrograms = getProductAcademicPrograms(item);
                    const assignedGenders = getProductGenders(item);
                    const assignedCategories = getProductMerchandiseCategoryCodes(item);
                    return (
                      <ProductItem
                        key={item._id}
                        id={item._id}
                        name={item.name}
                        image={item.image}
                        price={item.price}
                        priceFrom={item.priceFrom}
                        BestSeller={item.BestSeller}
                        category={item.category}
                        subCategory={item.subCategory}
                        academicPrograms={assignedPrograms}
                        genders={assignedGenders}
                        genderNames={assignedGenders.map(value => (
                          getProductGenderName(productCategories, value)
                        ))}
                        merchandiseCategoryCodes={assignedCategories}
                        academicProgramNames={assignedPrograms.map(value => (
                          getAcademicProgramName(productCategories, value)
                        ))}
                        productCategoryNames={assignedCategories.map(value => (
                          getProductCategoryName(productCategories, value)
                        ))}
                        collection
                      />
                    );
                  })}
                </div>
                {filteredProducts.length > 0 && (
                  <nav
                    className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 text-[13px] leading-[1.5] text-[color:var(--pamo-color-text-secondary)]"
                    aria-label="Collection pagination"
                  >
                    <p
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {`Showing ${pageStart + 1}–${pageStart + pageProducts.length} of ${filteredProducts.length} ${filteredProducts.length === 1 ? "essential" : "essentials"}`}
                    </p>
                    {pageCount > 1 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={outlineActionClassName + ' min-w-11 px-3 aria-disabled:cursor-default aria-disabled:border-[color:var(--pamo-color-border-default)] aria-disabled:bg-[var(--pamo-color-surface-subtle)] aria-disabled:text-[color:var(--pamo-color-text-secondary)]'}
                          aria-label="Previous product page"
                          aria-controls="collection-product-grid"
                          aria-disabled={currentPage === 1}
                          onClick={() => changePage(currentPage - 1)}
                        >
                          Previous
                        </button>
                        <span aria-current="page" className="text-center font-semibold text-[color:var(--pamo-color-accent-text)]">
                          Page {currentPage} of {pageCount}
                        </span>
                        <button
                          type="button"
                          className={outlineActionClassName + ' min-w-11 px-3 aria-disabled:cursor-default aria-disabled:border-[color:var(--pamo-color-border-default)] aria-disabled:bg-[var(--pamo-color-surface-subtle)] aria-disabled:text-[color:var(--pamo-color-text-secondary)]'}
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
                  <div className={collectionMessageClassName}>
                    <Search
                      className="shrink-0 text-[color:var(--pamo-color-text-secondary)]"
                      size={24}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <h2>
                      {emptyHeading}
                    </h2>
                    <p>
                      {emptyMessage}
                    </p>
                    {hasCriteria && (
                      <button
                        type="button"
                        className={brandActionClassName}
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
          merchandiseCategories={merchandiseCategories}
          genderOptions={genderOptions}
          programOptions={programOptions}
          merchandiseOptions={merchandiseOptions}
          categoriesLoading={categoriesLoading}
          categoryError={categoryError}
          onRetryCategories={getProductCategories}
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
