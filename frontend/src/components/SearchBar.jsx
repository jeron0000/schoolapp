import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext';
import { assets } from '../assets/assets';
import { useLocation } from 'react-router-dom';

const SearchBar = () => {

    const {search, setSearch, showSearch, setShowSearch} = useContext(ShopContext);
    const [visible,setVisible] = useState(false);
    const location = useLocation();

    useEffect(() => {
        if (location.pathname.includes('collection')) {
            setVisible(true);
        }
        else {
            setVisible(false);
        }
    },[location]) 

    return showSearch && visible ? (
        <div className='mt-6 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:px-5 dark:border-slate-800 dark:bg-slate-900'>
            <div className='flex min-w-0 flex-1 items-center gap-3'>
                <input value={search} onChange={(e) => setSearch(e.target.value)} className='field flex-1' type='search' aria-label='Search collection' placeholder='Search school essentials…' />
                <img className="w-4 theme-icon" src={assets.search_icon} alt="Search Icon" />
            </div>
            <button type='button' onClick={() => setShowSearch(false)} className='icon-button' aria-label='Close search'><img className='w-3 theme-icon' src={assets.cross_icon} alt=''/></button>
        </div>
    ) : null
    }

export default SearchBar
