const OPENWEATHER_API_KEY = 'ea4a485e720b34381c63a39f10623345';

const appRoot = document.getElementById('app-root');
const customAlertBox = document.getElementById('custom-alert-box');
const customAlertTitle = document.getElementById('custom-alert-title');
const customAlertMessage = document.getElementById('custom-alert-message');
const customAlertCloseBtn = document.getElementById('custom-alert-close');

function showAlert(title, message) {
    customAlertTitle.textContent = title;
    customAlertMessage.textContent = message;
    customAlertBox.classList.remove('hidden');
}

customAlertCloseBtn.addEventListener('click', () => {
    customAlertBox.classList.add('hidden');
});

const routes = {
    '#home': 'views/home.html',
    '#favorites': 'views/favorites.html',
    '#settings': 'views/settings.html'
};

async function loadView(viewPath) {
    try {
        const response = await fetch(viewPath);
        if (!response.ok) {
            throw new Error(`Cannot load view: ${response.status}`);
        }
        const html = await response.text();
        appRoot.innerHTML = html;
        return true;
    } catch (error) {
        console.error('Error loading view:', error);
        appRoot.innerHTML = `<div class="text-center text-red-500 p-8 bg-white rounded-xl shadow-lg">
                                <h2 class="text-2xl font-bold mb-4">Wystąpił błąd</h2>
                                <p>Nie udało się załadować tej części aplikacji. Sprawdź połączenie internetowe lub spróbuj później.</p>
                                <p class="mt-2 text-sm">Szczegóły błędu: ${error.message}</p>
                             </div>`;
        showAlert('Błąd ładowania', `Nie udało się załadować zawartości. ${error.message}`);
        return false;
    }
}

function router() {
    const path = window.location.hash || '#home';
    const viewFile = routes[path];

    if (viewFile) {
        loadView(viewFile).then(success => {
            if (success) {
                if (path === '#home') initHomePage();
                if (path === '#favorites') initFavoritesPage();
                if (path === '#settings') initSettingsPage();
            }
        });
    } else if (path.startsWith('#weather/')) {
        const city = decodeURIComponent(path.split('/')[1]);
        loadView(routes['#home']).then(success => {
            if (success) {
                initHomePage();
                const searchInput = document.getElementById('city-search-input');
                if (searchInput) searchInput.value = city;
                fetchAndDisplayWeather(city);
            }
        });
    } else {
        loadView(routes['#home']).then(success => {
            if (success) initHomePage();
        });
    }
}

const DB_NAME = 'WeatherPWA_DB';
const DB_VERSION = 1;
const FAVORITES_STORE_NAME = 'favoriteCities';
const SETTINGS_STORE_NAME = 'userSettings';
const WEATHER_CACHE_STORE_NAME = 'weatherApiCache';

let db;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(FAVORITES_STORE_NAME)) {
                db.createObjectStore(FAVORITES_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
                db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(WEATHER_CACHE_STORE_NAME)) {
                db.createObjectStore(WEATHER_CACHE_STORE_NAME, { keyPath: 'url' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('Error opening IndexedDB:', event.target.error);
            showAlert('Błąd Bazy Danych', `Nie udało się otworzyć lokalnej bazy danych: ${event.target.error}`);
            reject(event.target.error);
        };
    });
}

async function cacheWeatherData(url, data) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(WEATHER_CACHE_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(WEATHER_CACHE_STORE_NAME);
        const request = store.put({ url: url, data: data, timestamp: new Date().toISOString() });
        request.onsuccess = resolve;
        request.onerror = (event) => {
            console.error('Error caching weather data:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function getCachedWeatherData(url) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(WEATHER_CACHE_STORE_NAME, 'readonly');
        const store = transaction.objectStore(WEATHER_CACHE_STORE_NAME);
        const request = store.get(url);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            console.error('Error getting cached weather data:', event.target.error);
            reject(event.target.error);
        };
    });
}


async function addFavoriteCity(cityName) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const transactionCheck = db.transaction(FAVORITES_STORE_NAME, 'readonly');
        const storeCheck = transactionCheck.objectStore(FAVORITES_STORE_NAME);
        const getAllRequest = storeCheck.getAll();

        getAllRequest.onsuccess = () => {
            const existingCity = getAllRequest.result.find(fav => fav.name.toLowerCase() === cityName.toLowerCase());
            if (existingCity) {
                showAlert('Informacja', `Miasto "${cityName}" jest już na liście ulubionych.`);
                reject('City already exists');
                return;
            }

            const transaction = db.transaction(FAVORITES_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(FAVORITES_STORE_NAME);
            const request = store.add({ name: cityName });

            request.onsuccess = () => {
                showAlert('Sukces!', `Miasto "${cityName}" zostało dodane do ulubionych.`);
                resolve();
            };
            request.onerror = (event) => {
                showAlert('Błąd', `Nie udało się dodać miasta: ${event.target.error}`);
                console.error('Error adding favorite city:', event.target.error);
                reject(event.target.error);
            };
        };
        getAllRequest.onerror = (event) => {
            showAlert('Błąd', `Błąd sprawdzania ulubionych: ${event.target.error}`);
            console.error('Error checking favorites during add:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function getFavoriteCities() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(FAVORITES_STORE_NAME, 'readonly');
        const store = transaction.objectStore(FAVORITES_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            showAlert('Błąd', `Nie udało się pobrać ulubionych miast: ${event.target.error}`);
            console.error('Error fetching favorite cities:', event.target.error);
            reject(event.target.error);
        }
    });
}

async function removeFavoriteCity(cityId) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(FAVORITES_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(FAVORITES_STORE_NAME);
        const request = store.delete(cityId);

        request.onsuccess = () => {
            showAlert('Sukces!', 'Miasto zostało usunięte z ulubionych.');
            resolve();
        };
        request.onerror = (event) => {
            showAlert('Błąd', `Nie udało się usunąć miasta: ${event.target.error}`);
            console.error('Error removing favorite city:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function saveSettings(settingsObject) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SETTINGS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE_NAME);
        const request = store.put({ id: 'mainSettings', ...settingsObject });

        request.onsuccess = () => {
            showAlert('Sukces!', 'Ustawienia zostały zapisane.');
            resolve();
        };
        request.onerror = (event) => {
            showAlert('Błąd', `Nie udało się zapisać ustawień: ${event.target.error}`);
            console.error('Error saving settings:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function loadSettings() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SETTINGS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE_NAME);
        const request = store.get('mainSettings');

        request.onsuccess = () => {
            resolve(request.result || {});
        };
        request.onerror = (event) => {
            showAlert('Błąd', `Nie udało się załadować ustawień: ${event.target.error}`);
            console.error('Error loading settings:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function clearSettings() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SETTINGS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE_NAME);
        const request = store.delete('mainSettings');

        request.onsuccess = () => {
            showAlert('Sukces!', 'Ustawienia zostały wyczyszczone.');
            resolve();
        };
        request.onerror = (event) => {
            showAlert('Błąd', `Nie udało się wyczyścić ustawień: ${event.target.error}`);
            console.error('Error clearing settings:', event.target.error);
            reject(event.target.error);
        };
    });
}

function initHomePage() {
    const searchInput = document.getElementById('city-search-input');
    const searchButton = document.getElementById('search-weather-btn');

    if (searchButton) {
        searchButton.addEventListener('click', () => {
            const cityName = searchInput.value.trim();
            if (cityName) {
                fetchAndDisplayWeather(cityName);
                window.location.hash = `#weather/${encodeURIComponent(cityName)}`;
            } else {
                showAlert('Brak miasta', 'Proszę wpisać nazwę miasta.');
            }
        });
    }
    if (window.location.hash.startsWith('#weather/')) {
        const cityFromHash = decodeURIComponent(window.location.hash.split('/')[1]);
        if (searchInput) searchInput.value = cityFromHash;
        fetchAndDisplayWeather(cityFromHash);
    }
}

async function initFavoritesPage() {
    const addForm = document.getElementById('add-favorite-form');
    const cityInput = document.getElementById('favorite-city-input');

    if (addForm) {
        addForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const cityName = cityInput.value.trim();
            if (cityName) {
                try {
                    await addFavoriteCity(cityName);
                    cityInput.value = '';
                    await displayFavoriteCities();
                } catch (error) {
                    console.error("Error adding favorite:", error);
                }
            } else {
                showAlert('Brak miasta', 'Proszę wpisać nazwę miasta.');
            }
        });
    }
    await displayFavoriteCities();
}

async function displayFavoriteCities() {
    const favoritesListUl = document.getElementById('favorites-list');
    if (!favoritesListUl) return;

    try {
        const cities = await getFavoriteCities();
        favoritesListUl.innerHTML = '';

        if (cities.length === 0) {
            favoritesListUl.innerHTML = '<li class="text-gray-500 italic">Brak zapisanych ulubionych miast.</li>';
            return;
        }

        cities.forEach(city => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-xl shadow-sm';

            const cityNameSpan = document.createElement('span');
            cityNameSpan.textContent = city.name;
            cityNameSpan.className = 'text-gray-700 font-medium cursor-pointer hover:text-blue-600';
            cityNameSpan.addEventListener('click', () => {
                window.location.hash = `#weather/${encodeURIComponent(city.name)}`;
            });

            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Usuń';
            removeBtn.className = 'bg-red-500 hover:bg-red-600 text-white text-sm py-1 px-3 rounded-lg transition duration-150';
            removeBtn.addEventListener('click', async () => {
                try {
                    await removeFavoriteCity(city.id);
                    await displayFavoriteCities();
                } catch (error) {
                    console.error("Error removing favorite:", error);
                }
            });

            li.appendChild(cityNameSpan);
            li.appendChild(removeBtn);
            favoritesListUl.appendChild(li);
        });
    } catch (error) {
        favoritesListUl.innerHTML = '<li class="text-red-500 italic">Nie udało się załadować ulubionych.</li>';
        console.error("Error displaying favorite cities:", error);
    }
}

function initSettingsPage() {
    const settingsForm = document.getElementById('settings-form');
    const feedbackDiv = document.getElementById('settings-feedback');
    const savedSettingsDisplay = document.getElementById('saved-settings-display');
    const clearSettingsBtn = document.getElementById('clear-settings-btn');

    async function populateFormWithSavedSettings() {
        try {
            const settings = await loadSettings();
            if (settings) {
                if (settings.userName) document.getElementById('user-name').value = settings.userName;
                if (settings.defaultCity) document.getElementById('default-city').value = settings.defaultCity;
                if (settings.temperatureUnit) document.getElementById('temperature-unit').value = settings.temperatureUnit;
                displaySavedSettings(settings);
            } else {
                savedSettingsDisplay.innerHTML = '<p class="text-gray-500 italic">Brak zapisanych ustawień.</p>';
            }
        } catch (error) {
            console.error("Error loading settings into form:", error);
            savedSettingsDisplay.innerHTML = '<p class="text-red-500 italic bg-red-50 p-3 rounded-lg">Błąd ładowania ustawień.</p>';
        }
    }

    function displaySavedSettings(settings) {
        if (Object.keys(settings).length > 1) {
            savedSettingsDisplay.innerHTML = `
                <p class="mb-1"><strong>Imię:</strong> ${settings.userName || '<em>nie ustawiono</em>'}</p>
                <p class="mb-1"><strong>Domyślne miasto:</strong> ${settings.defaultCity || '<em>nie ustawiono</em>'}</p>
                <p><strong>Jednostka temperatury:</strong> ${settings.temperatureUnit === 'fahrenheit' ? 'Fahrenheit (°F)' : 'Celsjusza (°C)'}</p>
            `;
        } else {
            savedSettingsDisplay.innerHTML = '<p class="text-gray-500 italic">Brak zapisanych ustawień.</p>';
        }
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(settingsForm);
            const settings = {
                userName: formData.get('userName'),
                defaultCity: formData.get('defaultCity'),
                temperatureUnit: formData.get('temperatureUnit')
            };
            try {
                await saveSettings(settings);
                feedbackDiv.textContent = 'Ustawienia zapisane pomyślnie!';
                feedbackDiv.className = 'mt-4 text-green-600 bg-green-50 p-3 rounded-lg';
                setTimeout(() => feedbackDiv.textContent = '', 3000);
                displaySavedSettings(settings);
            } catch (error) {
                feedbackDiv.textContent = 'Błąd zapisu ustawień.';
                feedbackDiv.className = 'mt-4 text-red-600 bg-red-50 p-3 rounded-lg';
                console.error("Error saving settings:", error);
            }
        });
    }

    if (clearSettingsBtn) {
        clearSettingsBtn.addEventListener('click', async () => {
            if (confirm('Czy na pewno chcesz usunąć wszystkie zapisane ustawienia?')) {
                try {
                    await clearSettings();
                    if (settingsForm) settingsForm.reset();
                    populateFormWithSavedSettings();
                } catch (error) {
                    showAlert('Błąd', 'Nie udało się wyczyścić ustawień.');
                    console.error("Error clearing settings:", error);
                }
            }
        });
    }

    populateFormWithSavedSettings();
}

async function fetchAndDisplayWeather(cityName) {
    const weatherResultsContainer = document.getElementById('weather-results-container');
    if (!weatherResultsContainer) {
        showAlert('Błąd Interfejsu', 'Nie znaleziono miejsca do wyświetlenia pogody. Spróbuj przejść na stronę główną.');
        return;
    }

    weatherResultsContainer.innerHTML = '<p class="text-center text-gray-600 text-lg p-4">Ładowanie danych pogodowych...</p>';

    if (OPENWEATHER_API_KEY === 'TWOJ_KLUCZ_API_OPENWEATHER') {
        const errorMessage = 'Klucz API OpenWeatherMap nie został skonfigurowany. Proszę ustawić go w pliku app.js.';
        console.error(errorMessage);
        weatherResultsContainer.innerHTML = `<div class="text-center text-red-600 p-4 bg-red-100 rounded-xl shadow">${errorMessage}</div>`;
        showAlert('Błąd Konfiguracji', errorMessage);
        return;
    }

    let tempUnit = 'metric';
    let tempSymbol = '°C';
    try {
        const settings = await loadSettings();
        if (settings && settings.temperatureUnit === 'fahrenheit') {
            tempUnit = 'imperial';
            tempSymbol = '°F';
        }
    } catch (e) {
        console.warn("Could not load temperature unit settings, using default (Celsius).");
    }

    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${OPENWEATHER_API_KEY}&units=${tempUnit}&lang=pl`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Błąd autoryzacji. Sprawdź swój klucz API.');
            } else if (response.status === 404) {
                throw new Error(`Nie znaleziono miasta "${cityName}".`);
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        await cacheWeatherData(apiUrl, data);
        displayWeather(data, tempSymbol, false, new Date().toISOString());
    } catch (error) {
        console.warn('Error fetching weather data from network:', error.message, '. Attempting to load from cache...');
        const cachedEntry = await getCachedWeatherData(apiUrl);
        if (cachedEntry && cachedEntry.data) {
            showAlert('Jesteś offline', `Wyświetlam ostatnio zapisane dane dla "${cityName}".`);
            displayWeather(cachedEntry.data, tempSymbol, true, cachedEntry.timestamp);
        } else {
            weatherResultsContainer.innerHTML = `<div class="text-center text-red-600 p-4 bg-red-100 rounded-xl shadow">Nie udało się pobrać danych pogodowych dla "${cityName}" (brak połączenia lub brak archiwalnych danych). ${error.message}</div>`;
            showAlert('Błąd API / Offline', `Nie udało się pobrać danych dla "${cityName}" / brak danych archiwalnych. ${error.message}`);
        }
    }
}

function displayWeather(data, tempSymbol, isOffline = false, timestamp) {
    const weatherResultsContainer = document.getElementById('weather-results-container');
    if (!weatherResultsContainer) return;

    const { name, main, weather, wind, sys, dt } = data;
    const observationTime = isOffline ? new Date(timestamp) : new Date(dt * 1000);

    let offlineMessage = '';
    if (isOffline) {
        offlineMessage = `
            <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-3 rounded-md mb-4 text-sm shadow">
                <p class="font-bold">Jesteś w trybie offline</p>
                <p>Wyświetlane dane pochodzą z: ${observationTime.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${observationTime.toLocaleTimeString('pl-PL')}.</p>
            </div>
        `;
    }

    const weatherHTML = `
        <div class="weather-card bg-white p-6 rounded-2xl shadow-xl max-w-lg mx-auto transform hover:scale-105 transition-transform duration-300">
            ${offlineMessage}
            <h2 class="text-3xl font-bold text-gray-800 mb-1">${name}, ${sys.country}</h2>
            <p class="text-gray-500 mb-4 text-sm">
                Pogoda na dzień: ${new Date(dt * 1000).toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                ${!isOffline ? new Date(dt * 1000).toLocaleTimeString('pl-PL') : ''}
            </p>
            
            <div class="flex items-center mb-6">
                <img src="https://openweathermap.org/img/wn/${weather[0].icon}@2x.png" alt="${weather[0].description}" class="w-24 h-24 mr-4 drop-shadow-lg">
                <div>
                    <p class="text-6xl font-bold text-blue-600">${Math.round(main.temp)}${tempSymbol}</p>
                    <p class="text-xl text-gray-700 capitalize">${weather[0].description}</p>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-x-6 gap-y-3 text-gray-700">
                <p><strong>Odczuwalna:</strong> ${Math.round(main.feels_like)}${tempSymbol}</p>
                <p><strong>Wiatr:</strong> ${wind.speed.toFixed(1)} m/s</p>
                <p><strong>Wilgotność:</strong> ${main.humidity}%</p>
                <p><strong>Ciśnienie:</strong> ${main.pressure} hPa</p>
                <p><strong>Wschód słońca:</strong> ${new Date(sys.sunrise * 1000).toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit'})}</p>
                <p><strong>Zachód słońca:</strong> ${new Date(sys.sunset * 1000).toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit'})}</p>
            </div>
        </div>
    `;
    weatherResultsContainer.innerHTML = weatherHTML;
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDB();
    } catch (error) {
        console.error("Failed to initialize IndexedDB on startup:", error);
        showAlert('Krytyczny Błąd', 'Nie można uruchomić lokalnej bazy danych. Funkcjonalność aplikacji będzie ograniczona.');
    }

    router();
    window.addEventListener('hashchange', router);

    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registered successfully:', registration);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
            showAlert('Błąd PWA', 'Nie udało się zarejestrować Service Workera. Funkcje offline mogą nie działać.');
        }
    } else {
        console.warn('Service Worker not supported in this browser.');
        showAlert('Ostrzeżenie', 'Twoja przeglądarka nie wspiera Service Workerów. Funkcje offline nie będą dostępne.');
    }
});
