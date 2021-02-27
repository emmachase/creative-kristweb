const apiBase = "https://krist.ceriat.net/";
const rootState: Context = {
    currentPage: 1, // 2 3
    addressInput: "kristallie",

    // Methods
    clazz(...xs: (string | boolean | undefined)[]) {
        return xs.filter(x => typeof x === "string").join(" ");
    }      
};

function replaceAllChildren(target: HTMLElement, withEl: HTMLElement) {
    while (target.firstChild) target.removeChild(target.firstChild);
    target.appendChild(withEl);
}

type Context = {[k: string]: Context} | any;
function evaluateExpression(expression: string, context: Context): Context {
    void context; // Lint because it cant see inside the eval :shh:
    try {
        return eval("let __expr; with (context) { __expr = (" + expression + ") }; __expr")
    } catch {
        return false;
    }
}

function hydrateText(textNode: Text, context: Context) {
    const value = textNode.nodeValue;
    textNode.nodeValue = value.replace(/{{([^}]+)}}/g, (_, expression) => {
        return evaluateExpression(expression, context) as string;
    });
}

function getBinds(dataset: DOMStringMap) {
    const result = [];
    for (const prop in Object.assign({}, dataset)) {
        if (prop.startsWith("bind")) {
            result.push([prop, prop.match(/bind(.+)/)[1].replace(/[A-Z]/, d => d.toLocaleLowerCase()), dataset[prop]]);
        }
    }

    return result;
}

function hydrateTemplate(templateNode: HTMLElement, siblings: HTMLElement[], context: Context): HTMLElement {
    const dataset = templateNode.dataset;
    const binds = getBinds(dataset);

    if (dataset.if) {
        const expression = dataset.if;
        delete dataset.if;

        const value = !!evaluateExpression(expression, context);
        if (value) {
            hydrateTemplate(templateNode, siblings, context);
        } else {
            templateNode.parentElement.removeChild(templateNode);
        }

        const nextEl = siblings[siblings.findIndex(s => s === templateNode) + 1];
        if (nextEl) {
            if (nextEl.dataset.else !== undefined) {
                nextEl.dataset.else = (!value).toString();
            } else if (nextEl.dataset.elseif !== undefined) {
                nextEl.dataset.if = `${!value} && (${nextEl.dataset.elseif})`;
                delete nextEl.dataset.elseif;
            }
        }
    } else if (dataset.else !== undefined) {
        const expression = dataset.else;
        delete dataset.else;

        const value = !!evaluateExpression(expression, context);

        if (value) {
            hydrateTemplate(templateNode, siblings, context);
        } else {
            templateNode.parentElement.removeChild(templateNode);
        }
    } else if (dataset.for !== undefined) {
        const forValue = dataset.for;

        const [, alias, expression, idxBind] = forValue.match(/(.+) of (.+?)(?: with (.+))?$/);
        console.log(idxBind);
        const data = evaluateExpression(expression, context);
        if (Array.isArray(data)) {
            let referenceNode = templateNode;
            let idx = 0;
            for (const el of data) {
                const toInsert = templateNode.cloneNode(true) as HTMLElement;
                delete toInsert.dataset.for; // Make sure we don't recur

                const newElement = referenceNode.insertAdjacentElement("afterend", toInsert);
                hydrateTemplate(newElement as HTMLElement, [], {
                    ...context, [alias]: el, [idxBind ?? "__idx"]: idx++
                });

                referenceNode = newElement as HTMLElement; // Maintain ordering
            }
        }

        // Remove the original as we've hydrated the rest
        templateNode.parentElement.removeChild(templateNode);
    } else if (dataset.with) {
        const prop = evaluateExpression(dataset.with, context);
        delete dataset.with;

        hydrateTemplate(templateNode, siblings, {
            ...context,
            ...prop
        })
    } else if (binds.length) {
        for (const [name, prop, expression] of binds) {
            delete dataset[name];

            if (prop.startsWith("event")) {
                const eventName = (prop.match(/event(.+)/)[1]).toLowerCase();
                templateNode.addEventListener(eventName, evaluateExpression(expression, context))
            } else {
                templateNode.setAttribute(prop, evaluateExpression(expression, context));
            }
        }

        hydrateTemplate(templateNode, siblings, context);
    } else {
        // We slice beforehand to avoid issues with 'for' duplication
        
        const children = [].slice.call(templateNode.childNodes) as ChildNode[];
        for (const child of children) {
            if (child instanceof HTMLElement) {
                hydrateTemplate(child, children.filter(x => x instanceof HTMLElement) as HTMLElement[], context);
            } else if (child instanceof Text) {
                hydrateText(child, context);
            }
        }
    }

    return templateNode;
}

function fillTemplate(templateNode: HTMLElement, data: Context): HTMLElement {
    const result = templateNode.cloneNode(true) as HTMLElement;
    result.removeAttribute("id"); // Clear ID so it doesnt interfere with repaints

    return hydrateTemplate(result, null, data);
}


// Get and remove the template from the DOM
const templateRoot = document.getElementById("templateRoot");
templateRoot.parentElement.removeChild(templateRoot);

function refillTemplate(data: Context) {
    const templateSlot = document.getElementById("templateSlot");
    replaceAllChildren(templateSlot, fillTemplate(templateRoot, data));
}

function get(endpoint, args: Record<string, any> = {}) {
    const params = [];
    for (const key in args) {
        let val = args[key];
        if (val instanceof Array) val = val.join(",");
        params.push(`${key}=${encodeURIComponent(args[key])}`);
    }

    const dataurl = apiBase + endpoint + "?" + params.join("&");
    console.log(dataurl);
    return fetch(dataurl)
}

const $ = document.getElementById.bind(document)

refillTemplate(rootState);

async function fetchTransactions() {
    const transactions = await get("transactions/latest", { excludeMined: true });
    rootState.transactions = await transactions.json();
    console.log(rootState);

    refillTemplate(rootState);
}

async function fetchRichlist() {
    const transactions = await get("addresses/rich");
    rootState.richlist = await transactions.json();
    console.log(rootState);

    refillTemplate(rootState);
}

async function fetchAddressTransactions(address: string) {
    const transactions = await get("addresses/" + address + "/transactions", { excludeMined: true });
    rootState.singleTransactions = await transactions.json();
    refillTemplate(rootState);
}

async function fetchAddress(address: string) {
    const transactions = await get("addresses/" + address);
    rootState.addressData = await transactions.json();
    
    // Start fetching the transactions too (no await, we don't want to block the main info)
    fetchAddressTransactions(address);

    rootState.addressLoading = false;
    refillTemplate(rootState);
}

// Page load
fetchTransactions();

rootState.setPage = (page: number) => {
    console.log("Setting page to", page);
    rootState.currentPage = page;
    if (page === 1) {
        fetchTransactions();
    } else if (page === 2) {
        fetchRichlist();
    }

    refillTemplate(rootState);
}

rootState.reloadTransactions = () => {
    rootState.transactions = null;
    refillTemplate(rootState); // Show loading state
    fetchTransactions();
}

rootState.reloadRichlist = () => {
    rootState.richlist = null;
    refillTemplate(rootState); // Show loading state
    fetchRichlist();
}

rootState.bindRichClass = (idx: number) => {
    switch (idx) {
        case 0: return "text-warning";
        case 1: return "text-info";
        case 2: return "";
        default: return idx < 10 
            ? "text-success"
            : "text-muted";
    }
}

rootState.loadAddress = () => {
    const address = $("address_input").value;
    fetchAddress(address);

    rootState.addressInput = address;
    rootState.addressLoading = true;
    rootState.singleTransactions = null;
    refillTemplate(rootState);
}
