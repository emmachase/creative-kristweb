var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const apiBase = "https://krist.ceriat.net/";
const rootState = {
    currentPage: 1,
    addressInput: "kristallie",
    // Methods
    clazz(...xs) {
        return xs.filter(x => typeof x === "string").join(" ");
    }
};
function replaceAllChildren(target, withEl) {
    while (target.firstChild)
        target.removeChild(target.firstChild);
    target.appendChild(withEl);
}
function evaluateExpression(expression, context) {
    void context; // Lint because it cant see inside the eval :shh:
    try {
        return eval("let __expr; with (context) { __expr = (" + expression + ") }; __expr");
    }
    catch (_a) {
        return false;
    }
}
function hydrateText(textNode, context) {
    const value = textNode.nodeValue;
    textNode.nodeValue = value.replace(/{{([^}]+)}}/g, (_, expression) => {
        return evaluateExpression(expression, context);
    });
}
function getBinds(dataset) {
    const result = [];
    for (const prop in Object.assign({}, dataset)) {
        if (prop.startsWith("bind")) {
            result.push([prop, prop.match(/bind(.+)/)[1].replace(/[A-Z]/, d => d.toLocaleLowerCase()), dataset[prop]]);
        }
    }
    return result;
}
function hydrateTemplate(templateNode, siblings, context) {
    const dataset = templateNode.dataset;
    const binds = getBinds(dataset);
    if (dataset.if) {
        const expression = dataset.if;
        delete dataset.if;
        const value = !!evaluateExpression(expression, context);
        if (value) {
            hydrateTemplate(templateNode, siblings, context);
        }
        else {
            templateNode.parentElement.removeChild(templateNode);
        }
        const nextEl = siblings[siblings.findIndex(s => s === templateNode) + 1];
        if (nextEl) {
            if (nextEl.dataset.else !== undefined) {
                nextEl.dataset.else = (!value).toString();
            }
            else if (nextEl.dataset.elseif !== undefined) {
                nextEl.dataset.if = `${!value} && (${nextEl.dataset.elseif})`;
                delete nextEl.dataset.elseif;
            }
        }
    }
    else if (dataset.else !== undefined) {
        const expression = dataset.else;
        delete dataset.else;
        const value = !!evaluateExpression(expression, context);
        if (value) {
            hydrateTemplate(templateNode, siblings, context);
        }
        else {
            templateNode.parentElement.removeChild(templateNode);
        }
    }
    else if (dataset.for !== undefined) {
        const forValue = dataset.for;
        const [, alias, expression, idxBind] = forValue.match(/(.+) of (.+?)(?: with (.+))?$/);
        console.log(idxBind);
        const data = evaluateExpression(expression, context);
        if (Array.isArray(data)) {
            let referenceNode = templateNode;
            let idx = 0;
            for (const el of data) {
                const toInsert = templateNode.cloneNode(true);
                delete toInsert.dataset.for; // Make sure we don't recur
                const newElement = referenceNode.insertAdjacentElement("afterend", toInsert);
                hydrateTemplate(newElement, [], Object.assign(Object.assign({}, context), { [alias]: el, [idxBind !== null && idxBind !== void 0 ? idxBind : "__idx"]: idx++ }));
                referenceNode = newElement; // Maintain ordering
            }
        }
        // Remove the original as we've hydrated the rest
        templateNode.parentElement.removeChild(templateNode);
    }
    else if (dataset.with) {
        const prop = evaluateExpression(dataset.with, context);
        delete dataset.with;
        hydrateTemplate(templateNode, siblings, Object.assign(Object.assign({}, context), prop));
    }
    else if (binds.length) {
        for (const [name, prop, expression] of binds) {
            delete dataset[name];
            if (prop.startsWith("event")) {
                const eventName = (prop.match(/event(.+)/)[1]).toLowerCase();
                templateNode.addEventListener(eventName, evaluateExpression(expression, context));
            }
            else {
                templateNode.setAttribute(prop, evaluateExpression(expression, context));
            }
        }
        hydrateTemplate(templateNode, siblings, context);
    }
    else {
        // We slice beforehand to avoid issues with 'for' duplication
        const children = [].slice.call(templateNode.childNodes);
        for (const child of children) {
            if (child instanceof HTMLElement) {
                hydrateTemplate(child, children.filter(x => x instanceof HTMLElement), context);
            }
            else if (child instanceof Text) {
                hydrateText(child, context);
            }
        }
    }
    return templateNode;
}
function fillTemplate(templateNode, data) {
    const result = templateNode.cloneNode(true);
    result.removeAttribute("id"); // Clear ID so it doesnt interfere with repaints
    return hydrateTemplate(result, null, data);
}
// Get and remove the template from the DOM
const templateRoot = document.getElementById("templateRoot");
templateRoot.parentElement.removeChild(templateRoot);
function refillTemplate(data) {
    const templateSlot = document.getElementById("templateSlot");
    replaceAllChildren(templateSlot, fillTemplate(templateRoot, data));
}
function get(endpoint, args = {}) {
    const params = [];
    for (const key in args) {
        let val = args[key];
        if (val instanceof Array)
            val = val.join(",");
        params.push(`${key}=${encodeURIComponent(args[key])}`);
    }
    const dataurl = apiBase + endpoint + "?" + params.join("&");
    console.log(dataurl);
    return fetch(dataurl);
}
const $ = document.getElementById.bind(document);
refillTemplate(rootState);
function fetchTransactions() {
    return __awaiter(this, void 0, void 0, function* () {
        const transactions = yield get("transactions/latest", { excludeMined: true });
        rootState.transactions = yield transactions.json();
        console.log(rootState);
        refillTemplate(rootState);
    });
}
function fetchRichlist() {
    return __awaiter(this, void 0, void 0, function* () {
        const transactions = yield get("addresses/rich");
        rootState.richlist = yield transactions.json();
        console.log(rootState);
        refillTemplate(rootState);
    });
}
function fetchAddressTransactions(address) {
    return __awaiter(this, void 0, void 0, function* () {
        const transactions = yield get("addresses/" + address + "/transactions", { excludeMined: true });
        rootState.singleTransactions = yield transactions.json();
        refillTemplate(rootState);
    });
}
function fetchAddress(address) {
    return __awaiter(this, void 0, void 0, function* () {
        const transactions = yield get("addresses/" + address);
        rootState.addressData = yield transactions.json();
        // Start fetching the transactions too (no await, we don't want to block the main info)
        fetchAddressTransactions(address);
        rootState.addressLoading = false;
        refillTemplate(rootState);
    });
}
// Page load
fetchTransactions();
rootState.setPage = (page) => {
    console.log("Setting page to", page);
    rootState.currentPage = page;
    if (page === 1) {
        fetchTransactions();
    }
    else if (page === 2) {
        fetchRichlist();
    }
    refillTemplate(rootState);
};
rootState.reloadTransactions = () => {
    rootState.transactions = null;
    refillTemplate(rootState); // Show loading state
    fetchTransactions();
};
rootState.reloadRichlist = () => {
    rootState.richlist = null;
    refillTemplate(rootState); // Show loading state
    fetchRichlist();
};
rootState.bindRichClass = (idx) => {
    switch (idx) {
        case 0: return "text-warning";
        case 1: return "text-info";
        case 2: return "";
        default: return idx < 10
            ? "text-success"
            : "text-muted";
    }
};
rootState.loadAddress = () => {
    const address = $("address_input").value;
    fetchAddress(address);
    rootState.addressInput = address;
    rootState.addressLoading = true;
    rootState.singleTransactions = null;
    refillTemplate(rootState);
};
