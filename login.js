// DOM 元素
const emailInput = document.getElementById('emailInput');
const continueBtn = document.getElementById('continueBtn');
const googleBtn = document.querySelector('.google-btn');
const phoneBtn = document.querySelector('.phone-btn');

// 邮箱输入框交互
emailInput.addEventListener('input', function() {
    if (this.value.trim()) {
        this.classList.add('has-value');
    } else {
        this.classList.remove('has-value');
    }
});

// 邮箱验证
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Continue 按钮点击
continueBtn.addEventListener('click', function() {
    const email = emailInput.value.trim();
    
    // 点击动画
    this.style.transform = 'scale(0.98)';
    setTimeout(() => {
        this.style.transform = '';
    }, 150);
    
    if (!email) {
        showToast('Please enter your email address');
        emailInput.focus();
        return;
    }
    
    if (!isValidEmail(email)) {
        showToast('Please enter a valid email address');
        emailInput.focus();
        return;
    }
    
    // 模拟登录
    showToast(`Signing in with ${email}...`);
    
    // 实际应用中这里会跳转到验证页面
    // window.location.href = `/verify?email=${encodeURIComponent(email)}`;
});

// Google 登录
googleBtn.addEventListener('click', function() {
    // 点击动画
    this.style.transform = 'scale(0.98)';
    setTimeout(() => {
        this.style.transform = '';
    }, 150);
    
    showToast('Redirecting to Google...');
    
    // 实际应用中这里会调用 Google OAuth
    // window.location.href = '/auth/google';
});

// 手机登录
phoneBtn.addEventListener('click', function() {
    // 点击动画
    this.style.transform = 'scale(0.98)';
    setTimeout(() => {
        this.style.transform = '';
    }, 150);
    
    showToast('Opening phone verification...');
    
    // 实际应用中这里会打开手机验证弹窗
    // window.location.href = '/auth/phone';
});

// 回车键提交
emailInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        continueBtn.click();
    }
});

// Toast 提示
function showToast(message) {
    // 移除已存在的 toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: #0F172A;
        color: #FFFFFF;
        padding: 16px 32px;
        border-radius: 100px;
        font-family: 'SF Pro', -apple-system, sans-serif;
        font-size: 16px;
        font-weight: 400;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        opacity: 0;
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    // 显示动画
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    // 自动隐藏
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 页面加载动画
window.addEventListener('load', function() {
    const leftSection = document.querySelector('.left-section');
    const rightSection = document.querySelector('.right-section');
    
    // 初始状态
    leftSection.style.opacity = '0';
    leftSection.style.transform = 'translateX(-20px)';
    rightSection.style.opacity = '0';
    rightSection.style.transform = 'translateX(20px)';
    
    // 过渡设置
    leftSection.style.transition = 'all 0.6s ease-out';
    rightSection.style.transition = 'all 0.6s ease-out 0.1s';
    
    // 触发动画
    requestAnimationFrame(() => {
        leftSection.style.opacity = '1';
        leftSection.style.transform = 'translateX(0)';
        rightSection.style.opacity = '1';
        rightSection.style.transform = 'translateX(0)';
    });
});

// 输入框焦点效果
emailInput.addEventListener('focus', function() {
    this.parentElement.style.transform = 'scale(1.01)';
    this.parentElement.style.transition = 'transform 0.2s ease';
});

emailInput.addEventListener('blur', function() {
    this.parentElement.style.transform = 'scale(1)';
});
