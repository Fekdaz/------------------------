(function () {
  var MODAL_ID = "lead-modal";
  var FORM_ID = "lead-form";
  var PHONE_MAX_DIGITS = 11;

  function phoneDigits(raw) {
    var digits = raw.replace(/\D/g, "");
    if (digits.charAt(0) === "8") digits = "7" + digits.slice(1);
    if (digits.charAt(0) !== "7" && digits.length > 0) digits = "7" + digits;
    return digits.slice(0, PHONE_MAX_DIGITS);
  }

  function formatPhoneMask(raw) {
    var digits = phoneDigits(raw);
    var n = digits.charAt(0) === "7" ? digits.slice(1) : digits;

    if (!n.length) return "";

    var out = "+7";
    if (n.length <= 3) return out + " (" + n;
    out += " (" + n.slice(0, 3) + ")";
    if (n.length <= 6) return out + " " + n.slice(3);
    out += " " + n.slice(3, 6);
    if (n.length <= 8) return out + "-" + n.slice(6);
    return out + "-" + n.slice(6, 8) + "-" + n.slice(8, 10);
  }

  function isPhoneComplete(value) {
    return phoneDigits(value).length === PHONE_MAX_DIGITS;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function formatSubmittedAt(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) + " (МСК)";
    } catch (error) {
      return iso;
    }
  }

  function buildConsentSection(marketingConsent, submittedAt, consentMeta) {
    var personal = consentMeta && consentMeta.personal ? consentMeta.personal : {};
    var marketing = consentMeta && consentMeta.marketing ? consentMeta.marketing : {};
    var privacyVersion =
      consentMeta && consentMeta.privacyPolicyVersion ? consentMeta.privacyPolicyVersion : "—";

    var lines = [
      "--- Согласия ---",
      "Время отправки: " + formatSubmittedAt(submittedAt),
      "",
      "Согласие на обработку персональных данных: да (обязательное)",
      "Версия документа: " + (personal.documentVersion || "—"),
      "Документ: " + (personal.documentPath || "personal-data-consent.html"),
      "Версия политики ПДн: " + privacyVersion,
    ];

    if (marketingConsent) {
      lines.push("");
      lines.push("Согласие на рекламу: да");
      lines.push("Версия документа: " + (marketing.documentVersion || "—"));
      lines.push("Документ: " + (marketing.documentPath || "marketing-consent.html"));
      lines.push("Текст: согласие на получение информационных и рекламных сообщений");
      lines.push("(marketing-consent.html)");
    } else {
      lines.push("");
      lines.push("Согласие на рекламу: нет");
    }

    return lines.join("\n");
  }

  function formatLeadMessage(values, marketingConsent, submittedAt, consentMeta) {
    return [
      "Новая заявка с сайта tennerg.ru",
      "",
      "Компания: " + (values.company || "—"),
      "Имя: " + values.name,
      "Телефон: " + values.phone,
      "Email: " + (values.email || "—"),
      "Комментарий: " + (values.comment || "—"),
      "Страница: " + window.location.href,
      "",
      buildConsentSection(marketingConsent, submittedAt, consentMeta),
    ].join("\n");
  }

  function logFormConsent(type, formId, submittedAt) {
    if (!window.ConsentLog) return null;

    var versions = window.ConsentLog.versions();
    var paths = window.ConsentLog.paths;
    var isMarketing = type === "marketing";

    return window.ConsentLog.log({
      type: type,
      accepted: true,
      documentVersion: isMarketing ? versions.marketing : versions.personal,
      documentPath: isMarketing ? paths.marketing : paths.personal,
      formId: formId,
      at: submittedAt,
    });
  }

  function getWebhookUrl() {
    var config = window.KOZHEVNYA_CONFIG || {};
    var url = typeof config.leadWebhookUrl === "string" ? config.leadWebhookUrl.trim() : "";
    return url ? resolveApiUrl(url) : "";
  }

  function resolveApiUrl(path) {
    var value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return new URL(value.replace(/^\//, ""), window.location.href).href;
  }

  function getSmartCaptchaClientKey() {
    var config = window.KOZHEVNYA_CONFIG || {};
    var key = config.yandexSmartCaptchaClientKey;
    if (typeof key !== "string") return "";
    var trimmed = key.trim();
    if (!trimmed || trimmed.indexOf("YOUR_") === 0) return "";
    return trimmed;
  }

  var captchaState = {
    mode: "invisible",
    captchaId: "",
    smartWidgetId: null,
    smartToken: "",
    smartScriptLoading: null,
    onToken: null,
  };

  function handleSmartCaptchaToken(token) {
    captchaState.smartToken = token || "";
    if (captchaState.onToken) {
      captchaState.onToken(captchaState.smartToken);
      captchaState.onToken = null;
    }
  }

  function runSmartCaptcha() {
    if (captchaState.smartToken) {
      return Promise.resolve(captchaState.smartToken);
    }

    if (!window.smartCaptcha || captchaState.smartWidgetId === null) {
      return Promise.reject(new Error("captcha"));
    }

    return new Promise(function (resolve, reject) {
      var timeoutId = window.setTimeout(function () {
        captchaState.onToken = null;
        reject(new Error("timeout"));
      }, 30000);

      captchaState.onToken = function (token) {
        window.clearTimeout(timeoutId);
        if (token) {
          resolve(token);
        } else {
          reject(new Error("captcha"));
        }
      };

      try {
        window.smartCaptcha.execute(captchaState.smartWidgetId);
      } catch (error) {
        window.clearTimeout(timeoutId);
        captchaState.onToken = null;
        reject(error);
      }
    });
  }

  function loadSmartCaptchaScript() {
    if (window.smartCaptcha) return Promise.resolve();
    if (captchaState.smartScriptLoading) return captchaState.smartScriptLoading;

    captchaState.smartScriptLoading = new Promise(function (resolve) {
      var script = document.createElement("script");
      script.src = "https://smartcaptcha.yandexcloud.net/captcha.js";
      script.defer = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        resolve();
      };
      document.head.appendChild(script);
    });

    return captchaState.smartScriptLoading;
  }

  function resetSmartCaptcha() {
    captchaState.smartToken = "";
    captchaState.onToken = null;
    if (window.smartCaptcha && captchaState.smartWidgetId !== null) {
      try {
        window.smartCaptcha.reset(captchaState.smartWidgetId);
      } catch (error) {
        /* ignore */
      }
    }
  }

  function initSmartCaptcha() {
    var clientKey = getSmartCaptchaClientKey();
    var smartWrap = document.getElementById("lead-captcha-smart-wrap");
    var container = document.getElementById("lead-captcha-smart");

    if (!clientKey || !smartWrap || !container) {
      captchaState.mode = "invisible";
      if (smartWrap) smartWrap.hidden = true;
      return loadInvisibleCaptcha();
    }

    captchaState.mode = "smart";
    smartWrap.hidden = false;
    container.innerHTML = "";
    captchaState.smartWidgetId = null;
    captchaState.smartToken = "";

    return loadSmartCaptchaScript().then(function () {
      if (!window.smartCaptcha || typeof window.smartCaptcha.render !== "function") {
        captchaState.mode = "invisible";
        smartWrap.hidden = true;
        return loadInvisibleCaptcha();
      }

      captchaState.smartWidgetId = window.smartCaptcha.render(container, {
        sitekey: clientKey,
        invisible: true,
        hideShield: true,
        callback: handleSmartCaptchaToken,
      });

      return true;
    });
  }

  function loadInvisibleCaptcha() {
    captchaState.mode = "invisible";
    captchaState.captchaId = "";
    captchaState.smartToken = "";

    var smartWrap = document.getElementById("lead-captcha-smart-wrap");
    if (smartWrap) smartWrap.hidden = true;
    setError("lead-error-captcha", "");

    return fetch(resolveApiUrl("api/captcha-challenge"), { method: "GET" })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!response.ok || !data || !data.ok) {
              throw new Error("captcha");
            }

            if (data.type === "smart") {
              return initSmartCaptcha();
            }

            if (!data.id) {
              throw new Error("captcha");
            }

            captchaState.captchaId = data.id;
            return true;
          });
      })
      .catch(function () {
        setError(
          "lead-error-captcha",
          "Не загрузилась проверка. Закройте форму и откройте снова.",
        );
        return false;
      });
  }

  function initCaptcha() {
    var clientKey = getSmartCaptchaClientKey();
    if (clientKey) return initSmartCaptcha();
    return loadInvisibleCaptcha();
  }

  function ensureCaptchaReady() {
    if (captchaState.mode === "smart") {
      return runSmartCaptcha();
    }
    return Promise.resolve();
  }

  function getCaptchaPayload() {
    if (captchaState.mode === "smart") {
      return { captchaToken: captchaState.smartToken };
    }

    return { captchaId: captchaState.captchaId };
  }

  function validateCaptchaClient() {
    if (captchaState.mode === "smart") {
      if (!captchaState.smartToken) {
        return "Не удалось пройти проверку. Попробуйте ещё раз.";
      }
      return "";
    }

    if (!captchaState.captchaId) {
      return "Не загрузилась проверка. Закройте форму и откройте снова.";
    }
    return "";
  }

  function submitLead(record) {
    var webhookUrl = getWebhookUrl();

    if (!webhookUrl) {
      return Promise.resolve({ ok: true, delivered: false, skipped: true });
    }

    return fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "tennerg.ru",
        text: record.message,
        formId: record.formId,
        page: record.page,
        values: record.values,
        marketingConsent: record.marketingConsent,
        consent: record.consent,
        submittedAt: record.submittedAt,
        website: record.honeypot || "",
        captchaToken: record.captchaToken || "",
        captchaId: record.captchaId || "",
      }),
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!response.ok) {
              var message =
                data && typeof data.error === "string" && data.error
                  ? data.error
                  : "HTTP " + response.status;
              throw new Error(message);
            }
            return { ok: true, delivered: true };
          });
      })
      .catch(function (error) {
        return {
          ok: false,
          delivered: false,
          error: error instanceof Error ? error.message : "Ошибка отправки",
        };
      });
  }

  var closeTimer = null;
  var toastTimer = null;
  var CLOSE_MS = 420;

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function openModal() {
    var modal = getModal();
    if (!modal) return;

    if (window.KozhevnyaMetrika && typeof window.KozhevnyaMetrika.trackLeadFormOpen === "function") {
      window.KozhevnyaMetrika.trackLeadFormOpen();
    }

    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("lead-modal-open");

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        modal.classList.add("is-open");
      });
    });

    initCaptcha();

    var firstField = modal.querySelector("#lead-company");
    if (firstField instanceof HTMLElement) {
      window.setTimeout(function () {
        firstField.focus();
      }, 50);
    }
  }

  function closeModal(afterClose) {
    var modal = getModal();
    if (!modal) {
      if (typeof afterClose === "function") afterClose();
      return;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lead-modal-open");

    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(function () {
      modal.hidden = true;
      closeTimer = null;
      if (typeof afterClose === "function") afterClose();
    }, CLOSE_MS);
  }

  function showLeadToast() {
    var toast = document.getElementById("lead-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "lead-toast";
      toast.className = "lead-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.innerHTML =
        '<p class="lead-toast__title">Заявка отправлена</p>' +
        '<p class="lead-toast__text">В скором времени менеджер свяжется с вами.</p>';
      document.body.appendChild(toast);
    }

    toast.classList.remove("is-visible");
    void toast.offsetWidth;
    toast.classList.add("is-visible");

    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
      toastTimer = null;
    }, 5600);
  }

  function showSuccess() {
    closeModal(function () {
      resetModal();
    });
    showLeadToast();
  }

  function resetModal() {
    var modal = getModal();
    if (!modal) return;

    var form = modal.querySelector("#" + FORM_ID);
    if (form instanceof HTMLFormElement) form.reset();

    modal.querySelectorAll(".lead-modal__error").forEach(function (node) {
      node.textContent = "";
    });

    var formWrap = modal.querySelector(".lead-modal__form-wrap");
    var success = modal.querySelector(".lead-modal__success");
    if (formWrap) formWrap.hidden = false;
    if (success) success.hidden = true;

    resetSmartCaptcha();
    captchaState.captchaId = "";
    captchaState.smartToken = "";

    captchaState.onToken = null;

    var smartWrap = document.getElementById("lead-captcha-smart-wrap");
    if (smartWrap) smartWrap.hidden = true;
  }

  function setError(id, message) {
    var node = document.getElementById(id);
    if (node) node.textContent = message || "";
  }

  function bindTriggers() {
    document
      .querySelectorAll("a.btn.btn--primary, .js-open-lead-form")
      .forEach(function (trigger) {
        trigger.addEventListener("click", function (event) {
          event.preventDefault();
          resetModal();
          openModal();
        });
      });
  }

  function bindModal() {
    var modal = getModal();
    if (!modal) return;

    modal.querySelectorAll("[data-lead-close]").forEach(function (node) {
      node.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !modal.hidden) closeModal();
    });

    var phoneInput = modal.querySelector("#lead-phone");
    if (phoneInput instanceof HTMLInputElement) {
      phoneInput.addEventListener("input", function () {
        phoneInput.value = formatPhoneMask(phoneInput.value);
      });
    }

    var form = modal.querySelector("#" + FORM_ID);
    if (!(form instanceof HTMLFormElement)) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var companyInput = form.querySelector("#lead-company");
      var nameInput = form.querySelector("#lead-name");
      var phoneInputEl = form.querySelector("#lead-phone");
      var emailInput = form.querySelector("#lead-email");
      var commentInput = form.querySelector("#lead-comment");
      var personalConsent = form.querySelector("#lead-consent-personal");
      var marketingConsent = form.querySelector("#lead-consent-marketing");
      var honeypotInput = form.querySelector("#lead-website");
      var submitBtn = form.querySelector(".lead-modal__submit");

      var values = {
        company: companyInput instanceof HTMLInputElement ? companyInput.value.trim() : "",
        name: nameInput instanceof HTMLInputElement ? nameInput.value.trim() : "",
        phone: phoneInputEl instanceof HTMLInputElement ? phoneInputEl.value.trim() : "",
        email: emailInput instanceof HTMLInputElement ? emailInput.value.trim() : "",
        comment:
          commentInput instanceof HTMLTextAreaElement ? commentInput.value.trim() : "",
      };

      setError("lead-error-company", "");
      setError("lead-error-name", "");
      setError("lead-error-phone", "");
      setError("lead-error-email", "");
      setError("lead-error-consent", "");
      setError("lead-error-captcha", "");
      setError("lead-error-submit", "");

      var hasError = false;

      if (!values.name) {
        setError("lead-error-name", "Укажите имя");
        hasError = true;
      }

      if (!values.phone) {
        setError("lead-error-phone", "Укажите телефон");
        hasError = true;
      } else if (!isPhoneComplete(values.phone)) {
        setError("lead-error-phone", "Введите номер полностью: +7 (XXX) XXX-XX-XX");
        hasError = true;
      }

      if (values.email && !isValidEmail(values.email)) {
        setError("lead-error-email", "Укажите корректный email");
        hasError = true;
      }

      if (!(personalConsent instanceof HTMLInputElement) || !personalConsent.checked) {
        setError("lead-error-consent", "Необходимо согласие на обработку персональных данных");
        hasError = true;
      }

      if (hasError) return;

      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

      ensureCaptchaReady()
        .then(function () {
          var captchaError = validateCaptchaClient();
          if (captchaError) {
            setError("lead-error-captcha", captchaError);
            if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
            return;
          }

          var marketing =
            marketingConsent instanceof HTMLInputElement ? marketingConsent.checked : false;
          var submittedAt = new Date().toISOString();
          var personalConsentLog = logFormConsent("personal_data", FORM_ID, submittedAt);
          var marketingConsentLog = marketing
            ? logFormConsent("marketing", FORM_ID, submittedAt)
            : null;
          var privacyVersion = window.ConsentLog ? window.ConsentLog.versions().privacy : "1.0";
          var consentMeta = {
            personal: personalConsentLog,
            marketing: marketingConsentLog,
            privacyPolicyVersion: privacyVersion,
          };

          var message = formatLeadMessage(values, marketing, submittedAt, consentMeta);
          var captchaPayload = getCaptchaPayload();
          var record = {
            formId: FORM_ID,
            page: window.location.href,
            values: values,
            marketingConsent: marketing,
            message: message,
            submittedAt: submittedAt,
            honeypot: honeypotInput instanceof HTMLInputElement ? honeypotInput.value.trim() : "",
            captchaToken: captchaPayload.captchaToken || "",
            captchaId: captchaPayload.captchaId || "",
            consent: consentMeta,
          };

          try {
            localStorage.setItem("lead_" + Date.now(), JSON.stringify(record));
          } catch (error) {
            /* ignore storage errors */
          }

          submitLead(record).then(function (result) {
            if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;

            if (!result.ok) {
              setError(
                "lead-error-submit",
                result.error || "Не удалось отправить заявку. Попробуйте позже или позвоните нам.",
              );
              if (captchaState.mode === "smart") {
                resetSmartCaptcha();
              } else {
                loadInvisibleCaptcha();
              }
              return;
            }

            if (result.error && typeof console !== "undefined" && console.warn) {
              console.warn("[lead] webhook error:", result.error);
            }

            if (typeof console !== "undefined" && console.info && result.skipped) {
              console.info("[lead preview]\n" + message);
            }

            if (
              window.KozhevnyaMetrika &&
              typeof window.KozhevnyaMetrika.trackLeadFormSubmit === "function"
            ) {
              window.KozhevnyaMetrika.trackLeadFormSubmit(values);
            }

            showSuccess();
          });
        })
        .catch(function () {
          setError(
            "lead-error-captcha",
            "Не удалось пройти проверку. Попробуйте ещё раз.",
          );
          if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
          if (captchaState.mode === "smart") {
            resetSmartCaptcha();
          }
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindTriggers();
      bindModal();
    });
  } else {
    bindTriggers();
    bindModal();
  }

  window.openLeadForm = function () {
    resetModal();
    openModal();
  };
})();
