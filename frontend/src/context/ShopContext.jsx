import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import axios from 'axios';
import { getSizeStock } from '../../../shared/inventory';
import { ShopContext } from './shopContext';



const ShopContextProvider = (props) => {

        const currency = '$';
        const delivery_fee = 10;
        const backendUrl = import.meta.env.VITE_BACKEND_URL
        const [search, setSearch] = useState('');
        const [showSearch, setShowSearch] = useState(false);
        const [cartItems, setCartItems] = useState({});
        const [products, setProducts] = useState([]);
        const [token, setToken] = useState(() => localStorage.getItem('token') || '');
        const navigate = useNavigate();

        const addToCart = async (itemId, size) => {

                if (!size) {
                        toast.error('Select Product Size');
                        return;
                }

                let cartData = structuredClone(cartItems);
                const product = products.find(item => item._id === itemId);
                if ((cartItems[itemId]?.[size] || 0) + 1 > getSizeStock(product, size)) {
                        toast.error('The requested quantity is unavailable for this size.');
                        return;
                }

                if (cartData[itemId]) {
                        if (cartData[itemId][size]) {
                                cartData[itemId][size] += 1;
                        }
                        else {
                                cartData[itemId][size] = 1;
                        }
                }
                else {
                        cartData[itemId] = {};
                        cartData[itemId][size] = 1;
                }
                setCartItems(cartData);

                if (token) {
                        // Call backend API to update cart on server
                        try {

                                await axios.post(backendUrl + '/api/cart/add', {itemId, size}, { headers: { token } })

                        } catch (error) {
                                console.log(error)
                                toast.error(error.message)
                        }
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

                if (!Number.isSafeInteger(quantity) || quantity < 0 || (quantity > 0 && quantity > getSizeStock(products.find(item => item._id === itemId), size))) {
                        toast.error('Quantity exceeds the available stock for this size.');
                        return;
                }

                let cartData = structuredClone(cartItems);

                cartData[itemId][size] = quantity;

                setCartItems(cartData)

                if (token) {
                        try {
                                await axios.post(backendUrl + '/api/cart/update', {itemId, size, quantity}, { headers: { token } })
                        } catch (error) {
                                console.log(error)
                                toast.error(error.message)
                        }
                }
        }

        const getCartAmount = () => {
                let totalAmount = 0;
                for (const items in cartItems) {
                        let itemInfo = products.find((product) => product._id === items);
                        for (const item in cartItems[items]) {
                                try {
                                        if (cartItems[items][item] > 0) {
                                                totalAmount += itemInfo.price * cartItems[items][item];
                                        }
                                } catch {
                                        // A removed product can still have an entry in the saved cart.
                                }
                        }
                }
                return totalAmount;
        }

        const getProductsData = useCallback(() => {
                return axios.get(backendUrl + '/api/product/list').then(response => {
                        if (response.data.success) {
                                setProducts(response.data.products);
                        } else {
                                toast.error(response.data.message);
                        }

                }).catch(error => {
                        console.log(error)
                        toast.error(error.message)
                })
        }, [backendUrl])

        useEffect(() => {
                if (!token) return;
                let active = true;
                axios.post(backendUrl + '/api/cart/get', {}, { headers: { token } }).then(response => {
                        if(active && response.data.success) {
                                setCartItems(response.data.cartData)
                        }

                }).catch(error => {
                        if (!active) return;
                        console.log(error)
                        toast.error(error.message)
                })
                return () => { active = false; }
        }, [backendUrl, token]);
        
        useEffect(() => {
                getProductsData();
        }, [getProductsData]);




        const value = {
                products, currency, delivery_fee,
                search, setSearch, showSearch, setShowSearch,
                cartItems, addToCart, setCartItems,
                getCartCount, updateQuantity,
                getCartAmount, navigate, backendUrl,
                setToken, token, getProductsData

        }

        return (
                <ShopContext.Provider value={value}>
                        {props.children}
                </ShopContext.Provider>
        )


}

export default ShopContextProvider;
