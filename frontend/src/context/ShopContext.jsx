import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { sessionClaims, useAuthSession } from '../../../shared/authSession';
import { getSizeStock } from '../../../shared/inventory';
import { cartPhpTotal, ORDER_FEE_PHP, PHP_SYMBOL } from '../../../shared/money.js';
import { createCartSync } from '../utils/cartSync';
import { ShopContext } from './shopContext.js';

const MAX_TIMEOUT_DELAY = 2_147_000_000;
const VISIBLE_REFRESH_GRACE = 1000;

const clearProductRefresh = (timer) => {
  if (timer.current !== null) {
    globalThis.clearTimeout(timer.current);
    timer.current = null;
  }
};

const scheduleProductRefresh = (timer, effectiveAt, refreshProducts) => {
  clearProductRefresh(timer);
  const effectiveTime = Date.parse(effectiveAt);
  if (!Number.isFinite(effectiveTime)) {
    return;
  }

  const armTimer = () => {
    const remaining = effectiveTime - Date.now();
    if (remaining <= 0) {
      timer.current = globalThis.setTimeout(refreshProducts, 0);
      return;
    }
    timer.current = globalThis.setTimeout(
      armTimer,
      Math.min(remaining, MAX_TIMEOUT_DELAY),
    );
  };
  armTimer();
};

const ShopContextProvider = ({ children }) => {
  const currency = PHP_SYMBOL;
  const delivery_fee = ORDER_FEE_PHP;
  const backendUrl = import.meta.env.VITE_BACKEND_URL
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [cartItems, setCartItems] = useState({});
  const [cartReady, setCartReady] = useState(true);
  const [cartError, setCartError] = useState('');
  const [cartSync] = useState(() => createCartSync({
    onChange: setCartItems,
    onReady: setCartReady,
    onError: message => {
      setCartError(message);
      if (message) {
        toast.error(message);
      }
    },
  }));
  const [products, setProducts] = useState([]);
  const [productRequest, setProductRequest] = useState({ status: 'loading', error: '' });
  const [productCategories, setProductCategories] = useState([]);
  const [categoryRequest, setCategoryRequest] = useState({ status: 'loading', error: '' });
  const [studentProfile, setStudentProfile] = useState(null);
  const [profileRequest, setProfileRequest] = useState({ status: 'idle', error: '' });
  const productRequestId = useRef(0);
  const categoryRequestId = useRef(0);
  const productsActive = useRef(true);
  const categoriesActive = useRef(true);
  const productRefreshTimer = useRef(null);
  const lastProductRefresh = useRef(0);
  const clearSessionCart = useCallback(() => cartSync.reset(), [cartSync]);
  const { token, setToken, sessionMessage, isCurrentSession } = useAuthSession(
    axios, backendUrl, 'customer', clearSessionCart
  );
  const userId = sessionClaims(token, 'customer')?.sub || '';
  const navigate = useNavigate();
  const sessionNotice = useRef('');

  useEffect(() => {
    if (!sessionMessage) {
      sessionNotice.current = '';
      return;
    }
    if (sessionNotice.current === sessionMessage) {
      return;
    }
    sessionNotice.current = sessionMessage;
    toast.error(sessionMessage);
    navigate('/login?step=student', { replace: true });
  }, [sessionMessage, navigate]);

  const addToCart = async (itemId, size) => {
    try {
      if (!size) {
        throw new Error('Select Product Size');
      }
      const product = products.find(item => item._id === itemId);
      const availableStock = getSizeStock(product, size);
      return await cartSync.change(
        'add', itemId, size, undefined, availableStock
      );
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  }

  const getCartCount = () => {
    let totalCount = 0;
    for (const items in cartItems) {
      for (const item in cartItems[items]) {
        try {
          if (cartItems[items][item] > 0) {
            totalCount += cartItems[items][item];
          }
        } catch {
          // Skip an unreadable cart entry when calculating the count.
        }
      }
    }
    return totalCount;
  }

  const updateQuantity = async (itemId, size, quantity) => {
    try {
      const product = products.find(item => item._id === itemId);
      const availableStock = getSizeStock(product, size);
      return await cartSync.change(
        'update', itemId, size, quantity, availableStock
      );
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  }

  const getCartAmount = () => {
    try {
      return cartPhpTotal(products, cartItems);
    } catch {
      return NaN; // Invalid historical prices must not look like a free cart.
    }
  }

  const loadProducts = useCallback(async function refreshProducts() {
    if (!productsActive.current) {
      return undefined;
    }
    const requestId = ++productRequestId.current;
    try {
      const response = await axios.get(backendUrl + '/api/product/list');
      if (!productsActive.current || requestId !== productRequestId.current) {
        return undefined;
      }
      if (response.data.success && Array.isArray(response.data.products)) {
        setProducts(response.data.products);
        setProductRequest({ status: 'success', error: '' });
        lastProductRefresh.current = Date.now();
        scheduleProductRefresh(
          productRefreshTimer,
          response.data.nextPriceChangeAt,
          refreshProducts,
        );
        return response.data.products;
      }

      const message = response.data.message || 'Unable to load products.';
      setProductRequest({ status: 'error', error: message });
      toast.error(message);
      return undefined;
    } catch (error) {
      if (!productsActive.current || requestId !== productRequestId.current) {
        return undefined;
      }
      const message = error.message || 'Unable to load products.';
      setProductRequest({ status: 'error', error: message });
      toast.error(error.message);
      return undefined;
    }
  }, [backendUrl])

  const getProductsData = useCallback(() => {
    if (!productsActive.current) {
      return Promise.resolve();
    }
    setProductRequest({ status: 'loading', error: '' });
    return loadProducts();
  }, [loadProducts])

  const loadProductCategories = useCallback(async () => {
    if (!categoriesActive.current) return undefined;

    const requestId = ++categoryRequestId.current;
    try {
      const response = await axios.get(backendUrl + '/api/category/public');
      if (!categoriesActive.current || requestId !== categoryRequestId.current) {
        return undefined;
      }
      if (response.data.success && Array.isArray(response.data.categories)) {
        const archivedCategories = Array.isArray(response.data.archivedCategories)
          ? response.data.archivedCategories.map(category => ({ ...category, active: false }))
          : [];
        const categories = [...response.data.categories, ...archivedCategories];
        setProductCategories(categories);
        setCategoryRequest({ status: 'success', error: '' });
        return categories;
      }

      const message = response.data.message || 'Unable to load the latest categories.';
      setCategoryRequest({ status: 'error', error: message });
      return undefined;
    } catch (error) {
      if (!categoriesActive.current || requestId !== categoryRequestId.current) {
        return undefined;
      }
      const message = error.response?.data?.message
        || error.message
        || 'Unable to load the latest categories.';
      setCategoryRequest({ status: 'error', error: message });
      return undefined;
    }
  }, [backendUrl]);

  const getProductCategories = useCallback(() => {
    if (!categoriesActive.current) return Promise.resolve();
    setCategoryRequest({ status: 'loading', error: '' });
    return loadProductCategories();
  }, [loadProductCategories]);

  useEffect(() => {
    if (!token) {
      cartSync.connect(null);
      return () => cartSync.disconnect();
    }

    cartSync.connect({
      isCurrent: () => isCurrentSession(token),
      request: async (operation, body) => {
        const response = await axios.post(
          backendUrl + '/api/cart/' + operation,
          body,
          { headers: { token } },
        );
        return response.data;
      },
    });
    return () => cartSync.disconnect();
  }, [backendUrl, token, isCurrentSession, cartSync]);

  useEffect(() => {
    let active = true;
    if (!token) {
      setStudentProfile(null);
      setProfileRequest({ status: 'idle', error: '' });
      return undefined;
    }

    setProfileRequest({ status: 'loading', error: '' });
    axios.get(backendUrl + '/api/user/profile', { headers: { token } })
      .then(({ data }) => {
        if (!active) return;
        if (!data.success || !data.profile) {
          throw new Error(data.message || 'Unable to load your profile.');
        }
        setStudentProfile(data.profile);
        setProfileRequest({ status: 'success', error: '' });
      })
      .catch(error => {
        if (!active) return;
        const message = error.response?.data?.message || error.message || 'Unable to load your profile.';
        setProfileRequest({ status: 'error', error: message });
      });

    return () => {
      active = false;
    };
  }, [backendUrl, token]);

  const updateAcademicProgram = async academicProgram => {
    const { data } = await axios.put(
      backendUrl + '/api/user/profile',
      { academicProgram },
      { headers: { token } },
    );
    if (!data.success || !data.profile) {
      throw new Error(data.message || 'Unable to update your profile.');
    }
    setStudentProfile(data.profile);
    setProfileRequest({ status: 'success', error: '' });
    return data.profile;
  };

  useEffect(() => {
    productsActive.current = true;
    loadProducts();
    return () => {
      productsActive.current = false;
      productRequestId.current += 1;
      clearProductRefresh(productRefreshTimer);
    };
  }, [loadProducts]);

  useEffect(() => {
    categoriesActive.current = true;
    loadProductCategories();
    return () => {
      categoriesActive.current = false;
      categoryRequestId.current += 1;
    };
  }, [loadProductCategories]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }

    const refreshVisibleProducts = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      if (Date.now() - lastProductRefresh.current < VISIBLE_REFRESH_GRACE) {
        return;
      }
      lastProductRefresh.current = Date.now();
      loadProducts();
      loadProductCategories();
    };

    document.addEventListener('visibilitychange', refreshVisibleProducts);
    window.addEventListener('focus', refreshVisibleProducts);
    return () => {
      document.removeEventListener('visibilitychange', refreshVisibleProducts);
      window.removeEventListener('focus', refreshVisibleProducts);
    };
  }, [loadProducts, loadProductCategories]);

  const value = {
    products,
    currency,
    delivery_fee,
    productsLoading: productRequest.status === 'loading',
    productError: productRequest.error,
    productCategories,
    categoriesLoading: categoryRequest.status === 'loading',
    categoryError: categoryRequest.error,
    getProductCategories,
    search,
    setSearch,
    showSearch,
    setShowSearch,
    cartItems,
    addToCart,
    setCartItems: cart => cartSync.reset(cart),
    cartReady,
    cartError,
    reloadCart: cartSync.retry,
    isCartReady: cartSync.isReady,
    beginCartCheckout: cartSync.beginCheckout,
    getCartCount,
    updateQuantity,
    getCartAmount,
    navigate,
    backendUrl,
    setToken,
    token,
    userId,
    studentProfile,
    profileLoading: profileRequest.status === 'loading',
    profileError: profileRequest.error,
    updateAcademicProgram,
    sessionMessage,
    getProductsData
  }

  return (
    <ShopContext.Provider value={value}>
      {children}
    </ShopContext.Provider>
  )
}

export default ShopContextProvider;
